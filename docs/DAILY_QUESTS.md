# Daily quests

Every learner gets three quests a day, resetting at midnight in the learner's own device time zone: one listening, one study, one habit. Quests are free for everyone.

## How it works
- `src/lib/quests.ts` is pure. `pickDailyQuests(userId, dayKey)` hashes the learner and the day to pick one quest per kind from `QUEST_POOL`. Nothing is stored for the assignment.
- `src/lib/quest-store.ts` counts the learner's own rows for today (`xp_awards`, `study_xp_awards`, `duel_xp_awards`, plus accuracy from `listening_runs`) and stores a claim in `quest_claims` for each finished quest. The browser never sends progress or XP.
- Finishing all three adds a bonus claim (`quest_id = 'bonus'`).
- The primary key `(user_id, day_key, quest_id)` makes each claim pay once.
- **Time zone.** The browser sends its IANA zone in the `x-time-zone` header (`questZoneHeaders()`) on `/api/quests`, `/api/runs` and `/api/study-xp`. The server validates it and falls back to Vietnam when it is missing or invalid. The quest day is the local calendar day in that zone. Progress is counted by `created_at` inside that local day, and `quest_claims.day_key` holds the local day. Leaderboard weeks (`week_key`) stay on Vietnam time.
- A learner can only choose which zone to send. Changing zones can open a second quest window within 24 hours, which is accepted.
- Quest XP counts on the leaderboard and in `getUserXpTotals`. It is merged in `xp-store.ts` like study XP. The habit quest counts listening, study and duel XP, never quest XP.
- `POST /api/runs` and `POST /api/study-xp` call `syncQuestsQuietly` after granting XP and return a `quests` field. `GET /api/quests` returns the board and also reconciles, so a quest finished through a duel still pays.
- UI: a **Nhiệm vụ** tab in the bottom nav (`/quests`, `QuestsScreen`) and a quest line on `PartCompleteScreen`. The tab loads in the browser because the quest day depends on the device's time zone.

## Setup
Run `supabase/quest_claims.sql` once in the Supabase SQL editor. Until then quests stay hidden and nothing else is affected.

## Admin
The admin XP page (`src/app/admin/xp/page.tsx`) has a Daily quests section: quests finished, all-3 days, quest players, quest XP, a by-day chart and a by-type table. Claims are grouped by Vietnam day to match the other admin numbers.

## Tuning
Edit `QUEST_POOL`, `QUEST_BONUS_XP` and `QUEST_ACCURACY_MIN` in `quests.ts`. `MAX_QUEST_XP` (currently 75) is derived from them. Changing the pool mid-day can change a learner's quests for that day. Claims already stored keep their XP.

## Not built yet
- Quest XP is included in overview Highlights (`sumAdminRangeXp`). The admin XP page still shows it in its own Daily quests section, separate from the listening and duel chart.
- A quest line in the weekly recap.
- "Today" on the XP chip counts quest XP by Vietnam day, so near midnight it can differ from the learner's quest day.
- Duel and Blitzrunde quests.
