# Grammar nodes

Status: in progress. First topic: A1.2 Lektion 1, past tense of **haben** and **sein** (Präsens, Perfekt, Präteritum).

## Decisions

- Scope of the first topic: haben + sein only, all three tenses, as on the class slide.
- Trail: grammar nodes come after the vocab nodes: `Video → Study 1 → Practice 1 → … → Học ngữ pháp → Luyện ngữ pháp`.
- Audio: generated with ElevenLabs.
- Grammar nodes count like other nodes: they give XP, count for quests, show in admin, and the Lektion is only complete once grammar practice is done.
- A passed lesson jump marks grammar nodes as skipped. Grammar questions in the jump test come later.
- Vietnamese tips and example sentences are drafted, then reviewed by a teacher.

## Data

### Verb tables: `src/data/grammar/tenses.json`

Shared by every Lektion, so a later topic only adds verbs.

- `persons`: the table rows in class-slide order: ich, du, er/sie/es, ihr, wir/sie/Sie. `say` is the pronoun spoken in the row's audio.
- `tenses`: column ids and labels (`praesens`, `perfekt`, `praeteritum`).
- `verbs.<infinitive>`: `praesens` and `praeteritum` forms per person, `partizip` (Partizip II) and `aux` (haben or sein). Perfekt is built from them: the aux's Präsens form + Partizip, e.g. `hast … gehabt`.

Row audio: `public/audio/grammar/<verb>/<tense>-<person>.mp3`, e.g. `grammar/sein/praeteritum-du.mp3` says "du warst".

Audio is generated with ElevenLabs, voice "Theo Teacher – Clear & Trustworthy" (`TIKjTeWOFujJEvXK1qIU`), model `eleven_multilingual_v2`. Table rows are sent with a final period ("du warst.") for a falling tone. Use the same voice for new rows and examples so a table sounds like one speaker.

This file is separate from `verbs.json`, which keeps its Präsens-only shape for grammar gap cards.

### Lektion block: `grammar` in `src/data/levels/<level>/<lektion>.json`

```jsonc
"grammar": [
  {
    "id": "vergangenheit-haben-sein",   // lowercase slug, unique in the Lektion
    "titleVi": "Quá khứ của haben và sein",
    "verbs": ["haben", "sein"],          // one study part per verb, in this order
    "tips": [{ "id": "…", "titleVi": "…", "textVi": "…", "verb": "sein", "tense": "perfekt" }],
    // verb: show only in that verb's part. tense: shown after a wrong answer about that tense
    "examples": [                        // clip-shaped, audio next to the Lektion's clips
      { "filename": "…mp3", "script": "Ich war gestern zu Hause.", "translationVi": "…",
        "verb": "sein", "tense": "praeteritum", "person": "ich" }
    ],
    "drills": [                          // authored practice items; the rest are generated from the tables
      { "type": "transform", "verb": "sein", "tense": "praeteritum",
        "from": "Ich bin müde.", "to": "Ich war müde.", "translationVi": "…" },
      { "type": "error", "verb": "haben", "script": "Ihr hattest Durst.",
        "fix": "Ihr hattet Durst.", "whyVi": "…" }      // no "fix": the sentence is correct
    ]
  }
]
```

`npm run check:content` checks this block, `tenses.json`, and that every grammar MP3 is listed somewhere.

## Grammar study node

Authored in the Lektion's `study` block and taught like the class slides. See `docs/GRAMMAR_STUDY_SLIDES.md`.

A1.2 Lektion 1 is three parts: `s-sein`, `s-haben`, `s-uebung`. Perfekt is the past the class already knows. Präteritum of sein and haben is the new column. A table screen expands into five steps (pronouns, Präsens, Perfekt, a question mark, then the Präteritum forms). Präteritum endings are bold. The exercise part is the slide sentences: the Berlin and 10€ trios, then ist/war, Wo warst du?, and the two word orders that are both correct.

## Grammar practice node

Three parts of about 15 cards: haben, sein, mixed. Dealt from one seed per topic, like practice nodes, so part keys match on the browser, the server and in admin.

| Kind | Pattern | Source | Per part |
|---|---|---|---|
| `form-choice` | de text → de mc | examples + tables | 5 |
| `table-fill` | de table → de chips | tables | 2 |
| `tense-transform` | de text → de chips | `transform` drills | 3 |
| `bracket-order` | vn text → de chips | Perfekt examples | 2 |
| `tense-spot` | de listening → de mc | examples (audio) | 2 |
| `pronoun-pairing` | de text → de text | tables | 1 |
| `error-check` | de text → yes/no | `error` drills | 1–2 |

A wrong answer shows the rule (`whyVi` or the matching tip).

## Build steps

1. ✅ Data and content draft (`tenses.json`, the A1.2 Lektion 1 block, loader, content check). Content awaits teacher review.
2. ✅ Pure logic in `src/lib/grammar-node.ts` with tests: study screens, practice deck, answer checks, part keys.
3. ✅ ElevenLabs audio: 30 table rows, 14 examples.
4. ✅ UI: `/learn/[level]/[lektion]/grammar/study` and `/grammar/practice` (`?topic=&part=`). New: `ConjugationTableView`, `SentenceBracketView`, `TableFillCard`; the rest reuses `McCard`, `SentenceOrderCard`, `PairingCard`.
5. ✅ Trail and progress (see below).
6. XP, quests, admin.
7. Docs (`PRACTICE_CARDS.md`) and a full play-through.

## Progress and the trail

- A finished part is stored in `LearnProgress.grammarPartKeys` as `<topicId>:<partKey>` (study `s-<verb>`, practice the hashed `g…` key). A failed practice part is not stored.
- The catalog lists each topic's part keys (`AdminCatalogLesson.grammarNodes`). `projectLesson` turns each topic into a study and a practice activity after the clip nodes, so the trail, its locking, Lektion status and the admin view all see them. A passed lesson jump marks unfinished grammar nodes done, as skipped.
- A Lektion with grammar but no clips is open on the trail. The grammar part that finishes its last node stamps `completedAt`.
- Lektion progress keys: every level has a `lektion-1`, so `cefrLearnKey` stores A1.1 under the bare slug (existing data) and every other level as `<level>/<lektion>`.

### Known gaps

- A Lektion with clips and grammar is still stamped completed by its last clip practice part, before grammar is done. The trail shows it in progress until grammar is done, but `learnChapterCompleted` already says done. No Lektion has both yet.
- Grammar parts give no XP and do not count for quests yet (step 6). Start cards show no XP for them.
- `listLessonClipCatalog` still skips slugs shared by several levels, so newly added clips are not absorbed into finished Lektionen of any level (unchanged behaviour).
