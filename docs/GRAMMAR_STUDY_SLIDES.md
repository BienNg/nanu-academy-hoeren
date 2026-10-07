# Grammar study from the class slides

Status: plan. Rework of the A1.2 Lektion 1 grammar **study** node (past tense of haben and sein) so it teaches exactly like the class slides "A1.2 – Lektion 1 Präteritum". The practice node is reworked later and stays as it is.

## Decisions

- Scope: the grammar study node only. Practice keeps its deck, examples, drills and part keys.
- Perfekt is review: it is taught in A1.1, so the study node shows it as known and only teaches Präteritum.
- Same wording, sentences, order and colors as the slides. No extra sentences or tips beyond them.
- Perfekt = văn nói (umgangssprachlich), Präteritum = văn viết (schriftlich), as on the slide. The `alltag` tip, which says the opposite for haben/sein, is removed.
- No "copy into your notebook" step. The slide notes "Chép trước nha" and "Chia vở làm 4 cột" are left out.
- Slide colors, already in `TENSE_TONE`: Präsens cyan, Perfekt orange, Präteritum purple. Präteritum endings become **bold purple** (the slides show `war`**`st`**). Today they are blue and underlined. Slide 15 shows haben in blue. We use purple for both verbs so a color always means one tense.

## Slide flow → study screens

The study node is driven by an authored script (`study` in the Lektion's grammar block) instead of being generated from the tables. A table that fills in step by step is a run of screens. Each Continue shows one more step, so the session frame needs no new state.

### Part 1 · `s-sein` (slides 1–9)

| # | Slides | Screen kind | Content |
|---|---|---|---|
| 1 | 1–2 | `overview` | Title "Vergangenheit – Quá khứ". Three tense cards: **Präsens** Hiện tại · **Perfekt** Quá khứ, "Umgangssprachlich – dùng trong văn nói nhiều" · **Präteritum** Quá khứ, "schriftlich – dùng trong văn viết nhiều". |
| 2 | 3–4 | `known` step 1 | The three columns, with rows machen / haben / sind. Präsens and Perfekt are filled in (`haben … gemacht`, `haben … gehabt`, `sind … gewesen`). Präteritum: machen shows a grey "noch nicht gelernt – chưa học", haben and sind show **?**. |
| 3 | 5 | `known` step 2 | The **?** cells are circled, with "Das lernen wir heute. – Hôm nay học 🤙". |
| 4–8 | 6–9 | `table` sein, steps 1–5 | The 4-column table fills in one step at a time: pronouns → Präsens → Perfekt (`bin … gewesen`) → a big **?** → Präteritum `war / warst / war / wart / waren`. Tapping a filled row plays its audio. |

### Part 2 · `s-haben` (slides 10–15)

| # | Slides | Screen kind | Content |
|---|---|---|---|
| 1–5 | 10–15 | `table` haben, steps 1–5 | The same build-up: `habe … hatte`, endings bold. |

### Part 3 · `s-uebung` (slides 16–29)

| # | Slides | Screen kind | Content |
|---|---|---|---|
| 1 | 17 | `beispiele` | Präsens: "Tôi **đang** ở Berlin." → Ich **bin** in Berlin. · Perfekt: "Tôi **đã** ở Berlin." → Ich **bin** in Berlin **gewesen**. · Präteritum: "Tôi **đã** ở Berlin." → Ich **war** in Berlin. ✓ The marker word and the verb are in the tense's color. |
| 2–4 | 18–23 | `beispiele` steps 1–3 | 10€ shown one row at a time: Ich **habe** 10€. → Ich **habe** 10€ **gehabt**. → Ich **hatte** 10€. ✓ |
| 5 | 24–25 | `cue-choice` | "Cô ấy **đang** ở đâu?" Wo ___ sie? A. ist ✓ B. war |
| 6 | 26 | `cue-choice` | "Cô ấy **đã** ở đâu?" Wo ___ sie? A. ist B. war ✓ |
| 7 | 27 | `cue-choice` | "Bạn **đã** ở đâu đấy?" A. Wo bist du? B. Wo **warst** du? ✓ |
| 8 | 28 | `translate` | "Hôm qua tôi ở nhà." → *Gestern war ich zu Hause.* |
| 9 | 29 | `translate` | "Tháng trước tôi (đã) có một công việc ở Berlin." Hints: letzten Monat = tháng trước, eine Arbeit = một công việc. Two correct orders: *Letzten Monat hatte ich in Berlin eine Arbeit.* / *Ich hatte letzten Monat in Berlin eine Arbeit.* |

Checks are answered like today's quick checks (`McCard` + `FeedbackSheet`). A wrong answer shows the check's own `whyVi`.

## Data: `study` in the grammar block

The new block sits next to `tips`, `examples` and `drills`, which practice keeps using.

```jsonc
"study": [
  { "key": "s-sein", "screens": [
    { "kind": "overview" },
    { "kind": "known", "rows": [
      { "verb": "machen", "praesens": "machen", "perfekt": "haben … gemacht", "praeteritum": null },
      { "verb": "haben",  "praesens": "haben",  "perfekt": "haben … gehabt",  "praeteritum": "?" },
      { "verb": "sein",   "praesens": "sind",   "perfekt": "sind … gewesen",  "praeteritum": "?" }
    ] },
    { "kind": "table", "verb": "sein" }
  ] },
  { "key": "s-haben", "screens": [{ "kind": "table", "verb": "haben" }] },
  { "key": "s-uebung", "screens": [
    { "kind": "beispiele", "reveal": "all", "rows": [
      { "tense": "praesens", "vi": "Tôi đang ở Berlin.", "markerVi": "đang", "de": "Ich bin in Berlin.",
        "verbWords": ["bin"], "filename": "a12-l1-gram-15-ich-bin-in-berlin.mp3" }
      // …
    ] },
    { "kind": "beispiele", "reveal": "step", "rows": [ /* 10€ */ ] },
    { "kind": "cue-choice", "vi": "Cô ấy đang ở đâu?", "markerVi": "đang", "prompt": "Wo ___ sie?",
      "options": ["ist", "war"], "answer": "ist", "whyVi": "…" },
    { "kind": "translate", "vi": "Hôm qua tôi ở nhà.", "answers": ["Gestern war ich zu Hause."],
      "hints": [], "filename": "a12-l1-gram-24-gestern-war-ich-zu-hause.mp3" }
  ] }
]
```

- A `table` screen expands into its 5 steps in `grammar-node.ts`. Forms, endings and row audio come from `tenses.json`, which already holds all 30 rows.
- `translate` takes several `answers`. Word chips are built from the first answer. `checkGrammarOrder` accepts any answer in the list.
- `say` on a row or sentence overrides the spoken text for audio, e.g. "Ich habe zehn Euro." for `10€`.

## New audio (ElevenLabs, Theo voice, `a12-l1-gram-15…26`)

Ich bin in Berlin. · Ich bin in Berlin gewesen. · Ich war in Berlin. · Ich habe zehn Euro. · Ich habe zehn Euro gehabt. · Ich hatte zehn Euro. · Wo ist sie? · Wo war sie? · Wo warst du? · Gestern war ich zu Hause. · Letzten Monat hatte ich in Berlin eine Arbeit. · Ich hatte letzten Monat in Berlin eine Arbeit.

The 14 existing example clips stay, because practice uses them.

## Build steps

1. Types, loader and `npm run check:content` for the `study` block. The check covers: a known verb for each `table`, exactly one correct option for each `cue-choice`, every `answers` entry buildable from the same chips, and every MP3 present.
2. Content: write the `study` block from the slides and remove the `alltag` tip.
3. Logic: `grammarStudyParts` builds parts from `study`, with steps expanded and checks turned into `GrammarChoiceQuestion`. The old generated flow, its intro/tense/bracket/tips/examples screens and their tests are deleted once nothing uses them. New tests cover step expansion, part keys, multi-answer translate and the `say` override.
4. Audio: the 12 clips above, plus the content check.
5. UI in `GrammarStudyScreens.tsx`:
   - `OverviewScreen`: three cards with the speaking (megaphone) and writing (pen) icons.
   - `KnownScreen`: a 3×3 grid with grey "chưa học" cells and a circled **?**.
   - `TableBuildScreen`: 4 columns at 375px. The pronoun column is narrow. The Perfekt cell may wrap after "…" ("bin … / gewesen"). Each newly shown column fades in.
   - `BeispieleScreen`: a tense chip, the Vietnamese line with its marker word colored, then the German line with the verb colored and a ✓. Tapping a row plays it.
   - `cue-choice` reuses `McCard`, with the Vietnamese prompt above it and the marker colored.
   - `translate` reuses `SentenceOrderCard` with hint chips under the prompt.
6. Progress: adding `s-uebung` is a third study part (see open questions).
7. Update `GRAMMAR_NODES.md`. Play the node through in the sandbox (see memory: headless Chrome, :3100) at 375×667 and 390×844 and compare each screen with its slide.

## Open questions

- **Existing progress**: students who finished both old study parts would have the node reopen because of the new `s-uebung` part. Should old completion count as done, or should they redo it?
- **Slide 27**: the PDF only shows option B. Is A "Wo bist du?"?
- **Slide 4**: the Präsens column says "sind", not "sein". Keep "sind" exactly as on the slide?
- **`whyVi` for the cue checks**: the slides explain this out loud in class. Proposed text: "đang → Präsens (ist) · đã → Präteritum (war)". OK?
