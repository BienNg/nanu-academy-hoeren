# Practice card types

Each kind is named as **question language + format → answer language + format**.

Source of the kind list: `src/lib/card-kinds.ts`, plus `reply-choice` and `number-input` in `src/lib/sentence-order.ts`. Regular practice decks are built in `src/lib/sentence-order.ts` and `src/lib/practice-deck.ts`.

| Kind | Pattern | What the student does | Where it is dealt |
|---|---|---|---|
| `listening` | de listening → de typing | Hears the German clip and types the German. Every clip gets one listening-style anchor. | Regular practice. About 25% of anchors stay as typing (more when the part is short on German distractors). Duels, for clips with no translation or no other card. |
| `listening-choice` | de listening → de mc (practice), de listening → vn mc (duels) | Practice: hears the German clip and picks the German line they heard. Duels: hears the clip and picks the Vietnamese meaning ("Câu này nghĩa là gì?"). | Regular practice: about 75% of listening cards (`LISTENING_CHOICE_SHARE`) switch to this when enough German distractors exist. Duels: 60% of meaning-choice cards (`DUEL_LISTENING_CHOICE_SHARE`). |
| `order` | vn text → de chips | Reads the Vietnamese and taps shuffled German word chips into order, plus 1–3 distractor words. | Regular practice, lesson jump, duels, Blitzrunde. Needs sentence order, a translation, at least 3 words, and no numeric answer. |
| `multiple-choice` | de text → vn mc | Reads the German and picks the Vietnamese meaning. | Regular practice (one meaning drill per clip), lesson jump, duels, Blitzrunde. |
| `vi-choice` | vn text → de mc | Reads the Vietnamese and picks the German sentence. | Same places as multiple choice. Practice and lesson jump skip it for number clips and picture words; Blitzrunde does not. |
| `vi-input` | vn text → de typing | Reads the Vietnamese and types the German. | Duels and Blitzrunde only. Regular practice does not deal this. |
| `pairing` | vn text → de text | Matches five Vietnamese lines to their five German lines. At most one per practice part. | Regular practice, Blitzrunde. Not in duels or lesson jump. |
| `reply-choice` | de listening → de mc | Hears the other person's German line and picks a German reply ("Was sagst du?"). Same pattern string as practice `listening-choice`; the options are replies. | Regular practice, for Leben-in-Deutschland clips with `replies` (for example `src/data/living/nagelstudio.json`). Replaces that clip's meaning card. |
| `number-input` | de listening → de number | Would hear the clip and type the price or time. | **Unused.** Number clips are ordinary `listening` cards. |

In regular practice there is no **de listening → vn mc** card. After hearing the clip, the choice is German. Vietnamese choices only appear when the prompt is text (`de text → vn mc`). Duels are the exception: their `listening-choice` options are Vietnamese.

## How a practice part is dealt

Built by `buildPracticeDeck`, then `insertDiscreteCards`, then `mixListeningChoice`. Follow-up cards are placed at a random slot at least one card after that clip's listening card, so the answer does not sit next to the audio.

For each clip:

1. **Exactly one** de listening → de typing, or de listening → de mc. Every clip starts as typing. About 75% of those cards in the part then switch to multiple choice. Only clips with 3 German distractors of the same word count can switch, so a part short on them keeps more typing cards.
2. **Zero or one** vn text → de chips. Dealt when the clip is marked for sentence order, has a Vietnamese translation, and has no numeric answer.
3. **Zero or one** follow-up card:
   - If the clip has replies (Leben in Deutschland), this is a `reply-choice` card.
   - Otherwise it is a meaning card, picked at random from the ones the clip qualifies for: vn text → de mc, de text → vn mc. Both need a translation. vn text → de mc is skipped for number clips and picture words. If the clip qualifies for neither, this step deals nothing.

For the part, not per clip:

4. **Zero or one** vn text → de text (`pairing`). Dealt when the part itself has five short clips (at most 3 German words each) with a translation and distinct German text. One card covers those five clips.

A clip is therefore one listening card, plus up to one order card, plus up to one meaning or reply card. Pairing is extra and shared. `number-input` and `vi-input` (vn text → de typing) are not part of this flow. `vi-input` is still dealt in duels and Blitzrunde.

## Trail nodes

On a CEFR trail node (`practiceNodeDecks` in `src/lib/practice-node.ts`), each study part is dealt as above from one seed per node. The cards of all study parts in the node are then joined and cut into even parts of at most 20 cards (`MAX_PRACTICE_CARDS`). Because of that cut, the "one pairing per part" rule holds per study part: a final node part can hold zero or two pairing cards.

A node part's key is a hash of its card keys. Changing how cards are dealt (for example `LISTENING_CHOICE_SHARE`) changes those keys.
