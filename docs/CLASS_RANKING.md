# Class ranking and class quests

Classes compete against each other every week. A class's score is the total XP its learners earned that Vietnam week. Class quests give classmates a shared goal and pay XP to everyone who helped.

## Decisions
| Area | Decision |
| --- | --- |
| Score | Total XP of the class's learners this week. Same XP as the personal boards, no cap. |
| Range | Weekly only. Resets Monday 00:00 Vietnam time, like the XP board. |
| Who competes | Real classes only (`user_progress.class_name`). Leben-in-Deutschland workplace groups (`living:*`) are left out. |
| Which classes show | Only classes with XP this week. |
| Members | Learners only. Admins and staff count toward neither the total nor quest targets. |
| Class switch | A learner's week XP counts for their current class. |
| Row content | Total week XP, XP per learner, and on your own class: your contribution. |
| Week end | The top 3 classes are stored. Their learners earn a class podium badge family. |
| Class quests | 2 daily + 1 weekly, Vietnam day and week. |
| Payout | Contributors only, tap to claim, until the day or week ends. 25 XP daily, 80 XP weekly. |
| Quest UI | "Nhiệm vụ lớp" section on the Quests screen, with avatars of contributors. Never lists who has not helped. |
| Admin | Nothing new. |

## Part 1: Weekly class ranking (done)
- `src/lib/xp.ts`
  - Add `"classes"` to `LeaderboardBoard`.
  - Add `isStaff?: boolean` to `BoardPerson`.
  - Pure `rankClasses(people, viewerId)`: groups by `classKey`, skips `living:*`, empty keys, admins and staff. Counts members (learners with 0 XP included), sums XP, computes XP per learner. Hides classes at 0 XP. Ranks by XP, then XP per learner, then name. Labels come from `leaderboardClassOptions`.
  - `LeaderboardPayload.classes?: ClassBoardExtras` with the rows, the viewer's class rank, class XP and contribution.
- `src/lib/xp-store.ts`
  - `listBoardProfiles` also reads `staff` (falls back to the older column sets when it is missing).
  - `getClassLeaderboard(input)`: reads `readXpBoardPeople(…, "week")`, runs `rankClasses`, and sets the same tab flags as the other boards.
- `src/app/api/leaderboard/route.ts`: `board=classes`.
- `src/components/LeaderboardScreen.tsx`: a "Lớp" tab. On it, scope and range controls are hidden, the header card shows your class's XP and rank, and the list shows one row per class.
- Tests in `src/lib/xp.test.ts`.

## Part 2: Class quests (done)
- `src/lib/class-quests.ts` (pure)
  - Daily pool: 60% of the class practices, 2 parts per learner (each counts at most 3), 40% reach 90% on a listening part, half the class does a study part, half a duel per learner (each counts at most 2).
  - Weekly pool: everyone practices (one may miss out from 10 learners), 5 days on which 60% practiced, 6 parts per learner (each counts at most 10).
  - Targets: `ceil(rate × learners)`, never below 1.
  - Assignment by hash of `classKey + dayKey` (2 different daily quests) and `classKey + weekKey` (1 weekly quest). Nothing stored.
  - "Practice" means a listening or study part that earned XP. Duels and jump tests do not count as practice.
- `src/lib/class-quest-store.ts`
  - Roster: `listClassLearners` in `xp-store.ts`. Learners in the viewer's real class, no admins or staff, at request time.
  - Activity: this week's `xp_awards`, `study_xp_awards` and `duel_xp_awards` rows of the roster (by Vietnam `week_key`/`day_key`), with accuracy from `listening_runs`.
  - Claim: only today's and this week's quests are offered, so a quest can only be claimed before its day or week ends. The quest must be done and the viewer must be a contributor.
  - Claims go into `quest_claims`, so the XP counts on every board:
    - daily: `day_key` = today, `quest_id` = `class:<questId>`. The primary key stops a second claim.
    - weekly: `day_key` = the day it is claimed, `quest_id` = `class-week:<questId>`. The server refuses it when any claim for that id exists this week. Storing the claim day (not the Monday) keeps the XP in "today's XP".
  - `quest-store.ts` (personal board) and `admin-quests.ts` (admin quest stats) skip ids from `isClassQuestId`.
- `src/app/api/class-quests/route.ts`: GET the board, POST `{ questId }` to claim. A refused claim returns 409 with `denial`.
- `src/components/ClassQuestParts.tsx`: "Nhiệm vụ lớp" section on the Quests screen. It shows progress, avatars of who helped, and a claim button. It is hidden for learners without a class, admins and staff.
- Tests in `src/lib/class-quests.test.ts`.
- Not built: Blitzrunde participation as a class quest.

## Part 3: Week-end podium and badges (done)
- `supabase/class_podiums.sql`: `weekly_class_podiums (week_key, user_id, class_key, rank, class_xp)` and `weekly_class_podium_weeks`, like `weekly_podiums`. Run it once in Supabase.
- `classBoardPodiums` in `xp.ts` uses the same ranking as the classes board. Every learner of a top 3 class who earned XP that week gets a place. Learners with 0 XP that week get nothing.
- `badge-store.ts` ranks finished weeks for both podiums with one routine (`PODIUM_SOURCES`). The first check after setup also ranks the 8 weeks before it, using each learner's class today.
- `badges.ts`: stats `classWeekTop3` and `classWeekFirst`, families "Lớp trên bục" (`classpodium`) and "Lớp vô địch" (`classchamp`) in the "compete" group, targets 1 / 3 / 10 / 25.
- Account deletion and full progress wipes also remove `weekly_class_podiums` rows.
- The "Lớp" tab shows a "Nhà vô địch tuần trước" banner from the stored podium of the last finished week (`readLastWeekClassPodium` in `badge-store.ts`, passed into `getClassLeaderboard` by the API route). If no badge check has ranked that week yet, the tab ranks it first. Without the class podium tables the banner is hidden. A ranked week where no class earned XP shows "Chưa có nhà vô địch nào".

## Admin: Class league (done)
- `/admin/class-league` (Engagement group). Built by `buildAdminClassLeague` in `src/lib/admin-class-league.ts`, read by `readAdminClassLeague` in `class-quest-store.ts`.
- This week's classes board with learners who practiced, week XP, XP per learner, a square per day for the daily quests, the weekly quest and claims.
- Today's quests per class, with the names of who helped and how many claimed.
- The stored class podiums of the last 8 finished weeks.

## Numbers
- A learner who helps finish every class quest earns up to 2 × 25 × 7 + 80 = 430 XP a week from them.
- Tune in `class-quests.ts`.

## Later
- Teacher accounts and teacher badges.
- Teacher-picked weekly quest.
