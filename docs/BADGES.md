# Badges

Learners collect badges for what they already do in the app: earning XP, finishing parts, keeping a streak, finishing daily quests, winning duels, placing in Blitzrunde, finishing a week on top of the class XP board, and their class finishing a week on top of the classes board. Each of the 13 badge families has four tiers: Đồng, Bạc, Vàng and Kim cương. That makes 52 badges.

## How it works
- `src/lib/badges.ts` is pure. `BADGE_FAMILIES` lists each family, the stat it counts and four rising targets. `badgesToAward(stats, owned)` returns the tiers a learner reached but does not own yet.
- `src/lib/badge-store.ts` counts the stats from rows the server already wrote, stores new awards in `badge_awards`, and returns the collection. The browser never sends a stat or claims a badge.
- An earned badge stays earned. If a stat later drops (for example, an admin deletes one Lektion's runs), the badge is kept. A full wipe of a learner's progress and account deletion remove their badges.
- The primary key `(user_id, badge_id)` makes each badge unlock once. Only rows that one request inserted count as new, so two tabs never show the same unlock twice.

| Family | Stat | Source |
| --- | --- | --- |
| Cỗ máy XP | All-time XP | `getUserXpTotals` (every XP source, quests included) |
| Đôi tai vàng | Listening parts that earned XP | `xp_awards` |
| Không tì vết | Successful listening parts at 100% | `listening_runs` |
| Mọt sách | Study parts that earned XP | `study_xp_awards` |
| Nhà chinh phục | Lektionen completed (or passed by jump test) | `user_progress.data.learn` |
| Ngọn lửa bền bỉ | Longest streak ever | practice days in `user_progress.data` |
| Thợ săn nhiệm vụ | Days with the quest bonus chest | `quest_claims` (`quest_id = 'bonus'`) |
| Đấu sĩ | Duel wins | `duel_xp_awards` |
| Tia chớp | Top 3 in a ranked Blitzrunde | `listRankedResults({ userId })` |
| Bục vinh quang | Weeks finished in the class top 3 | `weekly_podiums` |
| Quán quân tuần | Weeks finished first in class | `weekly_podiums` |
| Lớp trên bục | Weeks their class finished in the top 3 classes | `weekly_class_podiums` |
| Lớp vô địch | Weeks their class finished first of all classes | `weekly_class_podiums` |

## Leaderboard weeks
The XP board only ranks the current week, so finished weeks are stored. The first badge check after a Vietnam week ends (Monday 00:00 plus 15 minutes of grace) ranks that week's class boards with `readWeeklyClassPodiums` and stores each class's top 3 in `weekly_podiums`. The ranking uses the same people and order as the class board (`classPodiums` in `xp.ts`). Admins, learners without a class and learners with 0 XP never take a place. `weekly_podium_weeks` records ranked weeks, so an empty week is not ranked again.

The first check after setup also ranks the 8 weeks before it. Those use each learner's class today, like the board does.

The classes board (see `docs/CLASS_RANKING.md`) is stored the same way in `weekly_class_podiums` and `weekly_class_podium_weeks`, ranked with `classBoardPodiums` in `xp.ts`. Every learner of a top 3 class who earned XP that week gets a row with the class's rank. Learners who sat the week out get nothing.

## UI
- `/badges` (`BadgesScreen`) shows the collection, grouped into Học tập, Thói quen and Thi đấu & xếp hạng. Tapping a family opens its four tiers, with goals, progress and the date each was earned.
- Entry points: a **Huy hiệu** chip in the leaderboard header and a card on the account screen.
- Unlock popup: `BottomNav` asks `GET /api/badges?unseen=1` at most every 45 seconds per tab (`badge-unseen.ts`). Unseen badges show one by one in `BadgeUnlockSheet`. Closing it sends `POST /api/badges { seen: [...] }`.

## Setup
Run `supabase/badges.sql` once in the Supabase SQL editor. Until then `/badges` shows "Chưa tải được huy hiệu" and nothing else is affected.

Then run `supabase/class_podiums.sql` for the two class badges. Until then those two families stay locked and every other badge still works.

## Tuning
Edit `targets` in `BADGE_FAMILIES`. Lowering a target awards the tier at the next check. Raising one never takes a badge away. To add a family, give it a new lowercase id and a stat in `BadgeStats`, then count that stat in `readBadgeStats`.

## Not built yet
- Badges on other learners' leaderboard rows.
- An admin view of badges earned.
- Badge unlocks on the part-complete screen. They appear on the next tab instead.
