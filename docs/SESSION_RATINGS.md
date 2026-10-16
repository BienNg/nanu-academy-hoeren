# Session ratings and teacher dashboard

After each live class session, students rate it in a short bottom sheet on Home. Teachers open `teacher.nanugo.app` to see how their sessions were received and how each student keeps up between classes. The teacher site is view-only.

Screen designs: https://claude.ai/artifact/W5yz1HKE6E7cn2obJgXvBe (pages "Học viên" and "Giáo viên").

Branch: `feature/session-ratings`.

Runs on the free tiers of Supabase and Vercel. See "Free-tier budget" before adding any read.

## Decisions
| Area | Decision |
| --- | --- |
| Sessions | Never stored or logged by hand. A class's session days come from `class_schedules` (weekdays, level start dates, skipped dates), the same rules as `classProgress`: one class day is one Lektion. A session is identified by `(class_key, session_date)`. |
| Session end | New columns on `class_schedules`: start time and length in minutes, in the class's time zone (`CLASS_FORMAT_TIME_ZONE`). Without a start time, the session ends at 23:59 that day. |
| Who is asked | Anyone whose `user_progress.class_name` maps to the class (`classKey`), including admins and staff. Teachers are not asked. Anyone without a class is never asked. |
| Window | From session end to 48 hours later. One prompt per session, only the newest open session. |
| Where it shows | Only on Home (`LevelViewClient`). Never during a session, exercise or video. |
| Dismiss | "Để sau" closes it for good for that session (stored). Swiping down or tapping outside only closes the sheet, and the Home card (S4) stays until the window ends. |
| Rating | 1–5 stars, tags from a fixed list (positive set for 4–5★, negative set for 1–3★), optional comment of up to 300 characters. One rating per student per session. A sent rating cannot be edited. "Mình vắng buổi này" stores `absent`, and "Buổi học không diễn ra" stores `not_held`. Neither has stars or XP, and both end the prompt. |
| Named | Teachers see who wrote each rating (T3) and each student's own ratings (T5). The student sheet says nothing about who reads it. |
| Under 3 ratings | The session's average, star breakdown and tag totals are hidden ("Chưa đủ đánh giá để hiển thị kết quả"). Single ratings still show on T3. |
| Reward | +10 XP per sent rating, stored in `quest_claims` with `quest_id = rating:<class_key>:<session_date>`, so it counts on every board. No new XP table. |
| Teacher site | `teacher.nanugo.app`, same Next.js app and Vercel project, routed by host. Google login. Read-only: no notes, no edits. Filters and sorting only change the view. |
| Who can open it | Teachers (`user_progress.teacher`) see the classes in `teacher_classes`. Owner and staff see every class. Everyone else sees T0's "Tài khoản này chưa có quyền giáo viên". |
| Access checks | In server code, like `/admin` for teachers today. Every teacher read takes the guard's result and checks the class key against it before touching the database. The service role key stays on the server. This replaces the spec's "enforced in the database". |
| "Behind" | Any one of: under 2 parts a day over the last 7 days, at least 1 Lektion behind the class, or 3+ days since last seen. Behind students sort first. |
| Pace colours | 4+ parts a day green, 2–3.9 amber, under 2 red. The number is always shown, so colour is never the only signal. |

## Free-tier budget
The tight limits are Supabase egress and Vercel function invocations. Rules for this feature:
- **Nothing polls.** No client timers, no cron. Every read happens on a page load or a tap.
- **No extra request on Home.** The pending rating is worked out in the server render of the learn page that already runs, and passed to `LevelViewClient` as a prop. No `GET /api/session-rating`.
- **Most Home loads read nothing new:**
  - Schedules: all `class_schedules` rows through `unstable_cache` (1 hour, tag `class-schedules`, revalidated when an admin saves a schedule). A few KB per hour, not per load.
  - If no session of the learner's class is open, stop there. 0 rows.
  - After a rating or "Để sau", a cookie (`nr_rated=<user_id>|<class_key>|<date>`, expires when the window closes) marks the session as done, and the server skips the lookup. 0 rows. The learner is in the value so a shared phone never skips a classmate.
  - Otherwise one primary-key lookup on `session_ratings`, selecting only `status`. Under 100 bytes.
  - The learner's `class_name` comes from a read the learn page already makes: the `level_access, class_name` select in `getUserAccessRow` (`progress-store.ts`, called by `requireLevelAccess`). Admins skip that access check, so their Home load pays one extra lookup of those two columns. Staff and learners reuse the access read. The staff/teacher flag read runs only for non-admins. |
- **Writes:** one `POST` per rating or dismiss. The XP claim is written in the same server call.
- **Teacher pages aggregate in Postgres.** T1 and T2 read `session_rating_summary(p_class_key)`, one row per session (about 200 bytes each, about 6 KB for a 30-session course), never every rating row. T3 reads the rows of one session only (at most class size).
- **Never read the whole progress document.** T4 and T5 select only the JSON paths they need, for the roster only (`.in("user_id", ids)`), as `rejectCopiedInitialProgress` already does: `learn:data->learn`, `videos:data->videos`, `activity:data->activity`. Parts per day come from `activity` (`studyRuns + practiceRuns`, kept 120 days), so no `xp_awards` scan. T5 reads one student.
- **Week XP and class rank** reuse the leaderboard's week totals (`xp_leaderboard_totals`, one row per learner) through `unstable_cache` with the leaderboard's own lifetime. No new XP query.
- **Teacher page cache:** each teacher read goes through `unstable_cache`, 5 minutes, keyed by class (`teacher-class:<key>`), like `admin-list-cache.ts`. A few teachers opening pages costs a handful of reads per class every 5 minutes at most. A new rating shows within 5 minutes.
- **Storage:** about 150 bytes per rating. 300 students × 2 sessions a week × 52 weeks ≈ 4.7 MB a year.
- **Measure before merging:** log `JSON.stringify(result).length` for every new read (Home pending check, summary, T3 rows, T4 roster slice, T5) with seeded data, and write the numbers in the PR.

## Part 1: Schema
- `supabase/class_schedules.sql`: add `session_start time` and `session_minutes smallint` (nullable, idempotent `add column if not exists`).
- New `supabase/session_ratings.sql`:
  - `session_ratings (class_key text, session_date date, user_id text, status text check in ('rated','dismissed','absent','not_held'), stars smallint null check 1–5, tags text[] default '{}', comment text null check length ≤ 300, created_at timestamptz default now(), primary key (class_key, session_date, user_id))`.
  - Check: `status = 'rated'` requires `stars`. `dismissed`, `absent` and `not_held` rows have no stars, tags or comment. `absent` is a student who missed a class that was held. `not_held` is a student reporting that the scheduled class did not take place. A holiday marked on the schedule is still not a session, so nobody is asked.
  - RLS on, no policies for `anon` or `authenticated`. Only the service role reads and writes, like every other table.
  - `session_rating_summary(p_class_key text)`: per session date, rated count, average (null under 3), star counts and tag counts (null under 3). Granted to `service_role` only.
- Account deletion also deletes the student's `session_ratings` rows (`deleteUserSessionRatings`). A full progress wipe keeps them: a rating is feedback on a session, not progress. The wipe already removes the rating XP with the rest of `quest_claims`.

## Part 2: Pure logic (`src/lib/session-ratings.ts`)
- `classSessionDays(schedule, levelOrder, from, to)`: lists session days with their level and Lektion. Exported from `class-schedule.ts` next to `classProgress`, sharing its loop, so both always agree.
- `sessionEndsAt(schedule, day)` and `openRatingSession(schedule, levelOrder, now)`: the newest session whose window (end to end + 48 h) contains `now`.
- `RATING_TAGS_HIGH`, `RATING_TAGS_LOW`, `normalizeRatingInput(input, stars)`: drops unknown tags and tags from the other set, trims the comment.
- `studentPace(activity, today)`, `isBehind(...)`, `paceTier(...)`: the rules in Decisions.
- Tests in `src/lib/session-ratings.test.ts`, added to the `test` script in `package.json`. Cover: skipped dates, a level change mid-week, a session at 23:30 Berlin time read from Vietnam, window edges at exactly 48 h, tag set switching, every "behind" rule.

## Part 3: Student store and API
- `src/lib/session-rating-store.ts`:
  - `readPendingRating(userId, className, doneCookie)`: the rules in "Free-tier budget". Returns `null` or `{ classKey, sessionDate, level, lektion, closesAt }`.
  - `submitRating(userId, input)`: checks that the session is open and belongs to the learner's class right now, inserts the `rated` row (the primary key blocks a second one), then writes the XP claim.
  - `dismissRating(userId, session)`: inserts a `dismissed` row. `{ absent: true }` inserts an `absent` row, and `{ notHeld: true }` inserts a `not_held` row. Neither pays XP.
- `src/app/api/session-rating/route.ts`: `POST` only. `{ classKey, sessionDate, stars, tags, comment }`, `{ dismiss: true }`, `{ absent: true }`, or `{ notHeld: true }`. Sets the done cookie. A second answer returns 409.
- `quest-store.ts` and `admin-quests.ts` skip `rating:` claim ids, like they skip class quest ids (add `isRatingClaimId`).

## Part 4: Student UI
- `src/components/session-rating/RatingSheet.tsx`: S1 (stars), S2 (tags and comment), S3 (thank you, closes after 2 s). S1 also offers "Mình vắng buổi này" and "Buổi học không diễn ra", each confirmed before it is stored. Stars and buttons follow `ChunkyButton`. Respects reduced motion.
- `src/components/session-rating/SessionRatingPrompt.tsx`: the S4 Home card, and which of sheet or card shows. The sheet opens once per session per device (`localStorage` key `nr-rating-seen:<class_key>|<date>`); after that, or after a soft close, only the card shows until the window ends. No request.
- Home sheets take turns through `src/lib/overlay-gate.ts`: the daily quest intro and the rating sheet each register while open, and the other waits. The rating sheet also waits for the first-run tour and the streak flame.
- Pingu: `RatingPingu({ mood: 0–5 })` in `src/components/session/Pingu.tsx` with the six faces from the canvas. SVG only for now; a `rating` artboard in `pingu.riv` can replace it later (`docs/PINGU_RIVE.md`).
- Title by day: "Buổi học hôm qua thế nào?" when the session was yesterday, otherwise "Buổi học hôm <thứ> thế nào?". Subtitle: "Lektion N · <thứ>, DD.MM".
- Rendered from the `sessionRating` prop of `LevelViewClient`. The prompt is loaded with `next/dynamic` (`ssr: false`), so with no pending session no code for it loads.

## Part 5: Admin
- `/admin/classes`: start time and length fields next to the weekdays. Saved by the existing schedule action, with `normalizeClassSchedule` extended to the two new fields. Saving revalidates the `class-schedules` tag.
- No ratings page in this branch (see Later).

## Part 6: Teacher site
- Routing: `src/proxy.ts` keeps the Auth.js wrapper and rewrites requests whose host starts with `teacher.` to `/teacher/...` (`NextResponse.rewrite`, see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). On the main host, `/teacher` redirects to `teacher.nanugo.app` in production.
- Local development: open `http://localhost:3000/teacher`. Google refuses `teacher.localhost` as an OAuth origin ("must end with a public top-level domain"), so in development the proxy serves the site at `/teacher` on the learner host and marks the request (`x-nanu-teacher-path`). `teacherBase()` (`src/lib/teacher-base.ts`) then prefixes every link, redirect and sign-in callback with `/teacher`. Sign-in there shares the learner session.
- `src/app/api/auth/[...nextauth]/route.ts` rebuilds the request URL from the Host header, because the Next dev server reports `localhost` in `request.url` even for other hosts, which sent the OAuth callback to the wrong host.
- Login: `/teacher/login` (T0) uses the same Google provider. The `authorized` callback in `src/auth.ts` lets it through, and its `callbackUrl` stays on the teacher host.
- Guard: `requireTeacherSite()` in `auth-guard.ts`. Same roles and `teacherClassKeys` as `requireDashboard`. Users with no role see the T0 denied state, not a 404. Every page calls it first and passes its result to `src/lib/teacher-store.ts`, whose functions refuse a class key outside it.
- Routes under `src/app/teacher/` with its own layout (no `AppShell`, no `BottomNav`):
  - `page.tsx` – T1 class cards.
  - `[classKey]/page.tsx` – T2 Phản hồi (summary, trend chart with Recharts, top tags, session list).
  - `[classKey]/sessions/[date]/page.tsx` – T3.
  - `[classKey]/students/page.tsx` – T4. Filter and sort live in the URL (`?behind=1&sort=xp`) and run on the cached rows, so changing them costs no database read.
  - `[classKey]/students/[userId]/page.tsx` – T5. Also checks that the student is in that class.
  - Empty states from the canvas on T2, T3 and T4.
- Reuse: Lektion and video counts come from the projectors in `admin-detail.ts`, fed with the JSON slices instead of the whole document, so the teacher site and the admin show the same numbers. Week XP and rank come from `listWeekBoardPeople` in `xp-store.ts` (the leaderboard's own totals).
- Data: `src/lib/teacher-store.ts`, every read cached 5 minutes (`unstable_cache`). Ratings use `session_rating_summary`, or `summarizeRatings` in code while that function is missing.
- The root layout skips the learner shell (splash, install prompt, daily quest intro, service worker) on the teacher host, because the browser path there is `/`.
- Not built from the designs: badges and join date on T5, and practice accuracy. They need reads the plan does not budget for.
- Measured on the real database (15.10.2026, 51 profiles, 10 classes, largest 7 learners), read-only:

  | Read | Bytes |
  | --- | --- |
  | Profiles for the week board (all learners, shared by every class) | 14 KB |
  | Progress slices of one class (`learn`, `videos`, `activity`) | 58–89 KB, 8–13 KB per learner |
  | Whole `data` for the same learners, for comparison | 166–255 KB |
  | `session_rating_summary` per class (no ratings yet) | 2 B; about 200 B per rated session |
  | Home pending lookup (one primary key) | 2 B |

  Each class costs one slice read per 5 minutes at most, and only while a teacher has it open. Ten classes opened three times a day each is about 10 × 3 × 30 × 90 KB ≈ 80 MB a month. If classes grow past ~20 learners, `learn` is the part to slim next (only the current level's keys).

## Part 7: Setup (manual, before release)
- Vercel: add the `teacher.nanugo.app` domain to the project.
- Google Cloud: add `https://teacher.nanugo.app` to the authorized origins and `https://teacher.nanugo.app/api/auth/callback/google` to the redirect URIs. Nothing for development: `localhost:3000/teacher` uses the existing localhost entries.
- Supabase SQL editor: run `class_schedules.sql`, then `session_ratings.sql`.
- Admin: set start times on each class in `/admin/classes`. Assign teachers to classes.
- No new environment variables.

## Verification
- `npm test`, `npm run lint`, `npm run build`.
- In the sandbox copy (port 3100, never :3000), seed synthetic classes, schedules, students and ratings. Then check:
  - The sheet appears once after a session ends. "Để sau" stops it for good, while closing the sheet leaves the Home card. Nothing appears 48 h after the session ends or during an exercise.
  - With the done cookie set, or no open session, Home makes no `session_ratings` query (log it).
  - A second rating is refused, and XP goes up by 10 once.
  - A teacher sees only their classes. Opening another class's URL, session or student directly shows the denied state.
  - Under 3 ratings hides the summary on T1, T2 and T3.
  - T1–T5 at phone and desktop widths.
  - The response sizes from "Free-tier budget", written in the PR.

## Order of work
1. Part 1 and Part 2 (schema and pure logic with tests).
2. Part 5 (admin start times), so every class has its times set before students are asked.
3. Part 3 and Part 4 (students can rate). Every class with a timetable starts getting prompts as soon as this ships.
4. Part 6 (teacher site), then Part 7 setup.

## Open questions
- Whether one `activity` run (`studyRuns`, `practiceRuns`) equals one "part" as students see it. If not, parts per day need `xp_awards` and `study_xp_awards` day counts instead, read as one `count` per user and day in SQL.
- Classes in the `online_de` format have students in Germany. Named ratings without telling students who reads them may need a line in the privacy policy.
- Vercel's Hobby plan is meant for non-commercial use. Worth checking against how NaNu NaNa uses it.

## Later
- An admin page across all classes (average by teacher and level).
