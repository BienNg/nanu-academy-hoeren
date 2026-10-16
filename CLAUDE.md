@AGENTS.md

# Blitzrunde is paused

`BLITZRUNDE_ENABLED` in `src/lib/blitzrunde.ts` is `false` (since 2026-10-16). Leave it off until asked to turn Blitzrunde back on. While it is false, do not add live-round reads or polls.

# Blitzrunde: keep the polls lean

Any change to Blitzrunde (`src/lib/blitzrunde*.ts`, `src/app/api/blitzrunde/`, `src/components/blitzrunde/`, `src/components/admin/AdminBlitzrunde.tsx`, `src/app/admin/blitzrunde/`) must account for database egress and response size. A whole class hits these endpoints at the same time on short intervals, so cost = bytes per read × players × polls per round.

- **The deck is heavy.** `blitzrunde_sessions.deck` is 8–100 KB of JSON (median ~60 KB). Read it only where the cards are actually needed: building the round, the one load that hands the student their cards, scoring a submit, and opening a round in the admin. Never read it in a heartbeat, lobby poll, results poll, banner poll or the admin round list.
- **Polls fetch only what changes.** Status, `ends_at`, participant counts and scores are a few hundred bytes. A poll must never re-send what the client already has (the deck, names it already shows, finished answers).
- **Name the columns.** No `select('*')` and no shared column list that drags `deck` along. In `blitzrunde-store.ts`, session reads go through `readSession` / `selectSessions` (lean: `deck_size` and `deck_counts` instead of the deck) and the cards through `readDeck`. The student GET returns the deck only with `?deck=1`; the admin poll only with `deck: true`, and answers only for students not in `haveAnswersFor`.
- **Do the math in the PR.** Before adding or changing a timer, write down the interval, how many clients run it at once, and the bytes per call. Current timers: student lobby 3 s, results 4 s, heartbeat 15 s, banner 5 s, admin 2 s.
- **Measure it.** For a new or changed poll, check the actual response size (DevTools, or `JSON.stringify(...).length` on the store result) rather than guessing.
