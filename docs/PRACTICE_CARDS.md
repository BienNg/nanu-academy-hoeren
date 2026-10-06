# Practice card types

Each kind is named as **question language + format → answer language + format**.

Source of the kind list: `src/lib/card-kinds.ts`, plus `reply-choice` and `number-input` in `src/lib/sentence-order.ts`. Regular practice decks are built in `src/lib/sentence-order.ts` and `src/lib/practice-deck.ts`.

| Kind | Pattern | What the student does | Where it is dealt |
|---|---|---|---|
| `listening` | de listening → de typing | Hears the German clip and types the German. Every clip gets one listening card. | Regular practice: about 25% of listening cards stay as typing (more when the part is short on German distractors). Duels, for clips with no translation or no other card. |
| `listening-choice` | de listening → de mc (practice), de listening → vn mc (duels) | Practice: hears the German clip and picks the German line they heard. Duels: hears the clip and picks the Vietnamese meaning ("Câu này nghĩa là gì?"). | Regular practice: about 75% of listening cards (`LISTENING_CHOICE_SHARE`) switch to this when enough German distractors exist. Duels: 60% of meaning-choice cards (`DUEL_LISTENING_CHOICE_SHARE`). |
| `listening-order` | de listening → de chips | Hears the German clip and taps shuffled German word chips into order, plus 1–3 distractor words. No Vietnamese is shown. | Regular practice, as one of the meaning cards. Lesson jump, duels. Not in Blitzrunde (no audio in class). Needs at least 3 words and no numeric answer. Needs no translation, and `noSentenceOrder` does not apply (`isListeningOrderEligible`). |
| `order` | vn text → de chips | Reads the Vietnamese and taps shuffled German word chips into order, plus 1–3 distractor words. | Regular practice (at most 4 per practice part, at the end), lesson jump, duels, Blitzrunde. Needs sentence order, a translation, at least 3 words, and no numeric answer (`hasOrderCard`). |
| `multiple-choice` | de text → vn mc | Reads the German and picks the Vietnamese meaning. | Regular practice (as one of the meaning cards), lesson jump, duels, Blitzrunde. |
| `vi-choice` | vn text → de mc | Reads the Vietnamese and picks the German sentence. | Same places as multiple choice. Practice and lesson jump skip it for number clips and picture words; Blitzrunde does not. |
| `vi-input` | vn text → de typing | Reads the Vietnamese and types the German. | Regular practice: 10% of meaning cards (`VI_INPUT_SHARE`) are swapped for this, so it adds no cards. Skipped for number clips and picture words. Duels and Blitzrunde. Not in lesson jump. |
| `pairing` | vn text → de text | Matches five Vietnamese lines to their five German lines. At most one per study part. | Regular practice, Blitzrunde. Not in duels or lesson jump. |
| `reply-choice` | de listening → de mc | Hears the other person's German line and picks a German reply ("Was sagst du?"). Same pattern string as practice `listening-choice`; the options are replies. | Regular practice, for Leben-in-Deutschland clips with `replies` (for example `src/data/living/nagelstudio.json`). Replaces that clip's meaning card. |
| `number-input` | de listening → de number | Would hear the clip and type the price or time. | **Unused.** Number clips are ordinary `listening` cards. |

| `grammar-gap` | de text → de mc | Reads the German line with one word blanked and picks the form that fills it. | Regular practice. Replaces one meaning card in each run of 3 clips with gaps (`GRAMMAR_CLIPS_PER_CARD`). |

In regular practice there is no **de listening → vn mc** card. After hearing the clip, the choice is German. Vietnamese choices only appear when the prompt is text (`de text → vn mc`). Duels are the exception: their `listening-choice` options are Vietnamese.

## Words used here

- **Listening card:** the one card per clip that plays its audio first: `listening` or `listening-choice` (`isAnchorKind`). Every other card for that clip comes after it.
- **Meaning card:** the clip's one follow-up card, picked at random with equal chance from the kinds it qualifies for: `multiple-choice`, `vi-choice`, `listening-order`. 10% of the time it is then swapped for `vi-input`.
- **Order card:** an `order` card (vn text → de chips).
- **Study part:** up to 12 clips, studied together (`MAX_STUDY_CLIPS`).
- **Practice part:** up to 20 cards, played in one round (`MAX_PRACTICE_CARDS`).

## Card kinds by role

What each kind is for in regular practice. Dashed boxes are not dealt in regular practice.

```mermaid
flowchart LR
  clip(["One clip"])

  subgraph L["Listening card (exactly 1)"]
    direction TB
    listening["listening<br/>de listening → de typing<br/>~25%"]
    lchoice["listening-choice<br/>de listening → de mc<br/>~75%"]
  end

  subgraph M["Follow-up card (0 or 1)"]
    direction TB
    reply["reply-choice<br/>de listening → de mc<br/>(clips with replies)"]
    subgraph MD["Meaning card, equal chance"]
      mc["multiple-choice<br/>de text → vn mc"]
      vi["vi-choice<br/>vn text → de mc"]
      lorder["listening-order<br/>de listening → de chips"]
    end
    viin["vi-input<br/>vn text → de typing<br/>(replaces 10% of meaning cards)"]
    gap["grammar-gap<br/>de text → de mc<br/>(replaces 1 meaning card<br/>per 3 clips with gaps)"]
  end

  subgraph S["Shared / end of part"]
    direction TB
    pairing["pairing<br/>vn text → de text<br/>(0 or 1, covers 5 clips)"]
    order["order<br/>vn text → de chips<br/>(0–4 per part)"]
  end

  subgraph X["Not in regular practice"]
    direction TB
    num["number-input<br/>(unused)"]
  end

  clip --> L
  clip --> M
  clip -.-> S
  MD -.-> gap
  MD -.-> viin

  style X stroke-dasharray: 5 5
  style num stroke-dasharray: 5 5
```

## How a study part is dealt

`dealPracticePart` in `src/lib/practice-deck.ts` runs these steps in order:

```mermaid
flowchart TD
  clips[/"partClips (≤ 12 clips)"/]
  clips --> b["buildPracticeDeck<br/>1 listening card (typing) per clip, in part order"]
  b --> d["insertDiscreteCards<br/>per clip: reply-choice or a meaning card<br/>(10% of meaning cards → vi-input),<br/>at a random slot with ≥ 1 card between it and its listening card"]
  d --> g["insertGrammarCards<br/>per run of 3 clips with gaps: 1 meaning card<br/>→ grammar-gap (≤ 6 cards after the listening card)"]
  g --> m["mixListeningChoice<br/>~75% of listening cards → listening-choice<br/>(only with 3 German distractors, same word count)"]
  m --> front["Block 1: front"]
  clips --> p["pairingCards<br/>5 short clips → 1 pairing card"]
  p --> blk2["Block 2: pairing (0–1)"]
  clips --> o["orderCards<br/>eligible clips → shuffle → cap at 4<br/>(cut listening-order clips first)"]
  front -. "which clips got listening-order,<br/>last card of the front" .-> o
  blk2 -. "pairing present?" .-> o
  o --> blk3["Block 3: order (0–4)"]
  front & blk2 & blk3 --> deck[["[...front, ...pairing, ...orders]"]]
```

How one clip picks its follow-up card:

```mermaid
flowchart TD
  start(["Clip"]) --> r{"has replies?"}
  r -- yes --> reply["reply-choice"]
  r -- no --> q{"qualifies for any meaning card?"}
  q -- no --> none["no follow-up"]
  q -- yes --> pick["pick 1 at random from the ones it qualifies for"]
  pick --> mc["multiple-choice<br/>needs translation"]
  pick --> vi["vi-choice<br/>needs translation,<br/>not number / picture"]
  pick --> lo["listening-order<br/>≥ 3 words, no numeric answer"]
  mc & vi & lo --> vq{"10%: clip has translation,<br/>not number / picture?"}
  vq -- yes --> viin["vi-input<br/>(replaces the meaning card)"]
  vq -- "no / other 90%" --> gq{"chosen as its run's<br/>grammar-gap clip?"}
  viin --> gq
  gq -- yes --> gap["grammar-gap<br/>(replaces the meaning card)"]
  gq -- no --> keep["keep meaning card"]
```

An example part of 6 clips (A–F). Each clip's follow-up lands after its listening card with at least one card in between, so the front block is interleaved. Here 5 clips qualify for an order card, so one is cut: D, because its meaning card was listening-order:

```text
Block 1 (front)                                                  Block 2   Block 3
A·lis  B·lis  A·mc  C·lis  B·gap  D·lis  C·vi  E·lis  D·lo  F·lis  E·mc  F·reply | pairing | C·ord  A·ord  E·ord  B·ord
```

`lis` = listening or listening-choice, `mc`/`vi`/`lo` = meaning card, `gap` = grammar gap, `ord` = order card.

The same three blocks in detail:

1. **Listening and meaning cards, mixed.**
   - **Exactly one** listening card per clip, in the part's order. Every clip starts as typing. About 75% then switch to de listening → de mc (`mixListeningChoice`). Only clips with 3 German distractors of the same word count can switch, so a part short on them keeps more typing cards.
   - **Zero or one** follow-up card per clip, at a random slot after its listening card:
     - If the clip has replies (Leben in Deutschland), a `reply-choice` card.
     - Otherwise a meaning card, picked at random from the ones the clip qualifies for: de text → vn mc, vn text → de mc, de listening → de chips. The two choice cards need a translation; vn text → de mc is skipped for number clips and picture words. Listening chips need at least 3 words and no numeric answer. If the clip qualifies for none, nothing is dealt.
     - 10% of the time (`VI_INPUT_SHARE`) the picked meaning card is swapped for vn text → de typing (`vi-input`), when the clip has a translation and is not a number clip or picture word. It takes the meaning card's place, so the count does not change.
     - Then, among clips with grammar gaps that got a meaning card, one meaning card per run of 3 such clips becomes a `grammar-gap` card (`insertGrammarCards`), placed within 6 cards after its listening card (`GRAMMAR_CARD_WINDOW`). The deck does not grow.
2. **Zero or one** pairing card (vn text → de text). Dealt when the part has five short clips (at most 3 German words each) with a translation and distinct German text. One card covers those five clips.
3. **Zero to four** order cards (vn text → de chips), shuffled, at the very end. When more than 4 clips qualify (`MAX_ORDER_CARDS`), 4 are kept at random. Clips whose meaning card is listening chips are cut first, so a student rarely builds the same sentence twice. Without a pairing card in between, the first order card is never the clip of the card just before it. A cut clip gets nothing in its place.

A clip is therefore one listening card, plus up to one meaning or reply card, plus maybe one order card. Pairing is shared. `number-input` is not part of this flow.

Outside trail nodes, one practice part is one `dealPracticePart` call, and `maxClipsPerPracticePart` picks a clip count that stays within 20 cards.

## Trail nodes

A Lektion's study parts are grouped into nodes of at most 2 study parts (`PARTS_PER_NODE`), as even as possible: 5 study parts become 2 + 2 + 1. Practice node N covers the clips of study node N.

`practiceNodeDecks` in `src/lib/practice-node.ts` deals each study part of the node with `dealPracticePart`, from one seed per node, and joins them. `cutPracticeCards` then cuts the cards into the fewest practice parts of at most 20 cards, as even as that allows, and never cuts inside a study part's block of order cards. Last, `capOrderCards` keeps at most 4 order cards in each practice part, which only matters when one part holds the order blocks of two small study parts.

```mermaid
flowchart TD
  lesson[/"Lektion"/] --> sp["Study parts (≤ 12 clips each)"]
  sp --> nodes["Group into nodes of ≤ 2 study parts<br/>e.g. 5 parts → 2 + 2 + 1"]
  nodes --> node["Practice node N<br/>(clips of study node N, one seed)"]
  node --> d1["dealPracticePart(study part 1)"]
  node --> d2["dealPracticePart(study part 2)"]
  d1 & d2 --> join["Join: [front₁ pairing₁ orders₁ front₂ pairing₂ orders₂]"]
  join --> cut["cutPracticeCards<br/>fewest parts of ≤ 20 cards, as even as possible,<br/>never cuts inside an order block"]
  cut --> cap["capOrderCards<br/>≤ 4 order cards per practice part"]
  cap --> p1[["Practice part 1"]]
  cap --> p2[["Practice part 2"]]
  cap --> p3[["Practice part 3"]]
```

On the current lessons this gives 2–3 practice parts per node, at most 19 cards per part.

A practice part's key is a hash of its card keys. Changing how cards are dealt changes those keys: a part saved only by its key then shows as not done until it is replayed.
