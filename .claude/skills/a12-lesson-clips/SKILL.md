---
name: a12-lesson-clips
description: "Turn a NaNu NaNa lesson slide deck (Canva PDF) from A1.2 onward into JSON audio/typing clips for NaNu Academy, checked against everything taught before (all of A1.1 and earlier A1.2 Lektionen) so no clip, word or verb card is repeated. Non-regular verbs get a Präsens conjugation card, regular verbs a plain word clip, new Partizip II forms a Perfekt card and taught Präteritum forms a Präteritum card. Also use it to add verb cards to an existing Lektion."
---

# Lesson slides → JSON clips (A1.2 onward)

Use this when Bien uploads a lesson PDF from A1.2 or later (e.g. `03_A1_2_Online_core.pdf`) and asks for that Lektion's clips. Each clip is recorded as audio, and its `script` is the exact answer the student types. A1.1 is finished; this skill never edits it.

**Nothing may repeat what students have already learned.** Every clip is checked against all earlier Lektionen before Bien gets the JSON. Leaving a repeat out at this stage costs nothing; removing it after recording leaves orphaned MP3s that fail the content check and the deploy.

## 1. Load what was taught before

In the repo (`nanu-academy-horen`), read the clip index before choosing any content:

- `src/data/clip-index/a1-1.md`: all of A1.1
- `src/data/clip-index/<level>.md` for the level you're working on, e.g. `a1-2.md` (it lists the A1.2 Lektionen written so far; use only the ones before the target Lektion)

Each index lists verb cards by tense, then words and phrases (with Vietnamese), then sentences, each with the Lektionen it appears in. `npm run index:clips` regenerates them from the lesson JSON; never edit them by hand.

Without the repo (e.g. on claude.ai), use `references/a1-1-clip-index.md` from this skill. It only covers A1.1, so tell Bien the earlier A1.2 Lektionen couldn't be checked.

## 2. Read the slides

- Extract the text: `pdftotext -layout <file>.pdf -`. Drop the repeated footer lines ("Mọi hình thức phát tán…", "Trung tâm giỏi, học viên thắng lợi!") and blank lines.
- Canva decks build each slide in steps, so the same slide shows up several times. Use the most complete version (the one with the answer filled in).
- Get the lesson number from the filename or the title (`03_A1_2…` → A1.2 Lektion 3).
- If the text layer is garbled or missing, render the pages and look at them before guessing.

## 3. Pick the content

Go through the deck in order and take:
- Example sentences from the grammar explanation
- The new forms taught in tables
- Every ÜBUNG / LÖSUNG sentence, using the German from the answer slide
- Every vocabulary hint in brackets on an exercise slide (e.g. `(der Termin: lịch hẹn; leider: tiếc là)`)
- Verb cards, by the rules in section 5

Skip slide titles, instructions ("Bitte abschreiben!") and meta text ("Das lernen wir später").

**Then drop everything already taught**, using the index:
- **Same script as an earlier clip** (after trimming, collapsing spaces and ignoring capitals): leave it out. A sentence that uses a word taught earlier gets no word clip for it.
- **Near match: the same apart from punctuation or a leading article** (`Küche` vs `die Küche`, `Ich war in Berlin` vs `Ich war in Berlin.`): keep it and list it in the reply for Bien to decide. Never drop it on your own: `den Termin` or `einem Monat` can be the new case form the lesson teaches, not a repeat of `der Termin` or `ein Monat`.
- **Same verb and tense as an earlier verb card**: no new card. A new tense of a known verb is new (A1.2's Präteritum `sein` card is new although A1.1 has a Präsens `sein` card).
- A repeat inside the deck: keep the first one.

## 4. Rules for clips

- **The script is what the student types.** A word clip holds only the target form: `mich`, not `ich – mich`. Nouns keep their article: `der Termin`.
- **Order is word → sentence, word → sentence.** Put each new word (or verb card) directly before the first sentence that uses it. Sentences that use only known words go first.
- **Where the slide offers alternatives** ("Wohnt/Lebt"), pick one. If the slide gives two full sentences (e.g. two word orders), make a clip for each.
- **Where an exercise has no answer slide**, write a correct, simple answer and flag it.
- German must be standard Hochdeutsch and match the solution slides exactly, punctuation included.
- `translationVi` is natural Vietnamese, normally the slide's own Vietnamese prompt with the diacritics fixed (the PDF text layer often breaks them, e.g. "câǹ" → "cần"). Word clips get a short gloss, e.g. `tôi (tân ngữ – Akkusativ)`.

## 5. Verb cards

A verb card is a clip with a conjugation table. The app shows it as a study card and turns it into a table to fill in or pronouns to pair with forms. Every table has exactly six rows, in this order, with these labels: `ich`, `du`, `er/sie/es`, `wir`, `ihr`, `sie/Sie`. Each row is `{ "person", "form", "filename" }`. A clip carries only one of the three table fields.

Only a verb that would get its own word clip (from a vocabulary hint, a verb table, a list of new words, or a new Partizip II) gets a card. A verb that only appears inside a sentence gets none.

### Präsens: `conjugation`, only for non-regular verbs

- **Non-regular** (gets a card): stem-vowel change (`fahren` → fährst, `sehen` → siehst), irregular verbs (`sein`, `haben`, `werden`, `wissen`), modal verbs, separable verbs with an irregular part (`losfahren`, `fernsehen`), and `-ern`/`-eln` verbs (`wandern`: wir wandern).
- **Regular** (plain infinitive word clip, no table): standard -e/-st/-t/-en/-t/-en endings, including regular separable verbs (`abholen`), `-ieren` verbs (`telefonieren`), stems ending in -t/-d (`arbeiten`: du arbeitest) and stems ending in -s/-ß/-z (`heißen`: du heißt).
- If a verb doesn't fit either list, ask Bien before writing it.
- The script is the infinitive; `form` is the verb form alone (`fährst`), copied from the slide's table when there is one, else the correct standard form, flagged.

```json
{
  "filename": "a12-tag3-04-fahren.mp3",
  "script": "fahren",
  "translationVi": "đi bằng xe; lái xe",
  "conjugation": [
    { "person": "ich", "form": "fahre", "filename": "a12-tag3-04-ich-fahre.mp3" },
    { "person": "du", "form": "fährst", "filename": "a12-tag3-04-du-faehrst.mp3" },
    { "person": "er/sie/es", "form": "fährt", "filename": "a12-tag3-04-er-faehrt.mp3" },
    { "person": "wir", "form": "fahren", "filename": "a12-tag3-04-wir-fahren.mp3" },
    { "person": "ihr", "form": "fahrt", "filename": "a12-tag3-04-ihr-fahrt.mp3" },
    { "person": "sie/Sie", "form": "fahren", "filename": "a12-tag3-04-sie-fahren.mp3" }
  ]
}
```

### Perfekt: `perfectConjugation`, for every new Partizip II

When a sentence uses haben/sein + Partizip II and the index has no Perfekt card for that verb, add a Perfekt card directly before that sentence. This applies to regular and non-regular verbs alike.

- **The script is the Partizip II** (`gekommen`, `verstanden`).
- **`translationVi` must contain `Partizip II của <infinitive>`**, plus the auxiliary: `đã đến (Partizip II của kommen – đi với sein)`. The duplicate check reads the verb from this text.
- **`form` is the full phrase, auxiliary + Partizip II** (`bin gekommen`, `hast verstanden`), with no pronoun. Use the slide's auxiliary; if the slide doesn't show it, use the standard one and flag it.
- **Row filenames name the auxiliary and the participle**: `a12-tag1-k01-du-hast-verstanden.mp3`.

```json
{
  "filename": "a12-tag1-k01-verstanden.mp3",
  "script": "verstanden",
  "translationVi": "đã hiểu (Partizip II của verstehen – đi với haben)",
  "perfectConjugation": [
    { "person": "ich", "form": "habe verstanden", "filename": "a12-tag1-k01-ich-habe-verstanden.mp3" },
    { "person": "du", "form": "hast verstanden", "filename": "a12-tag1-k01-du-hast-verstanden.mp3" },
    { "person": "er/sie/es", "form": "hat verstanden", "filename": "a12-tag1-k01-er-hat-verstanden.mp3" },
    { "person": "wir", "form": "haben verstanden", "filename": "a12-tag1-k01-wir-haben-verstanden.mp3" },
    { "person": "ihr", "form": "habt verstanden", "filename": "a12-tag1-k01-ihr-habt-verstanden.mp3" },
    { "person": "sie/Sie", "form": "haben verstanden", "filename": "a12-tag1-k01-sie-haben-verstanden.mp3" }
  ]
}
```

### Präteritum: `praeteritumConjugation`, when the slide teaches it

For verbs whose Präteritum the lesson teaches (e.g. `sein`, `haben`, modal verbs), when the index has no Präteritum card for them.

- The script is the infinitive; `translationVi` is a past-tense gloss ending in `(Präteritum)`: `đã là; đã ở (Präteritum)`.
- `form` is the single Präteritum form (`war`, `hattest`).
- **The app doesn't show this table yet**: the content check validates it, but `src/lib/levels.ts` only loads `conjugation` and `perfectConjugation`, so the clip shows as a plain word clip. Write it anyway and say so in the reply.

### Audio for verb cards

Seven recordings per card: the card clip says its script (infinitive or Partizip II), and each row says pronoun + form (`du fährst`, `du hast verstanden`, `du warst`). Pronouns in row filenames are `ich`, `du`, `er` (for er/sie/es), `wir`, `ihr`, `sie` (for sie/Sie).

## 6. Filenames and numbering

- Level prefix: `a12-tag<N>-` for A1.2 (later levels follow the same pattern, e.g. `a21-tag<N>-`).
- **New Lektion:** every clip, verb cards included, is numbered in one sequence: `a12-tag<N>-<NN>-<slug>.mp3`. NN is two digits, starts at 01 and keeps counting across follow-up messages for the same lesson.
- **Adding verb cards to an existing Lektion** (already recorded or used by students): don't renumber anything. Use a tense letter with the next free number for that letter in the Lektion: `p` Präsens, `k` Perfekt, `t` Präteritum, e.g. `a12-tag1-k02-gegessen.mp3`. Edit `src/data/levels/<level>/lektion-<N>.json` directly.
- The slug is short, lowercase ASCII with hyphens (ä→ae, ö→oe, ü→ue, ß→ss) and matches the script. Row filenames use the card's number: `<prefix>-<NN>-<pronoun>-<form slug>.mp3`. Every filename in the Lektion must be unique.
- Build the JSON from a Python list of `(slug, script, translationVi)` tuples (plus `(person, form)` rows for a verb card) and number it automatically, so edits renumber cleanly. Write it with `ensure_ascii=False, indent=2`.

## 7. Check the draft before handing it over

Save the draft as `{ "clips": [...] }` and run, in the repo:

```bash
node scripts/check-clip-duplicates.mjs <draft.json>
```

It reads the target Lektion from the first filename (`a12-tag3-…` → A1.2 Lektion 3; pass `--lesson a1-2/3` otherwise) and compares the draft with every earlier Lektion. It reports exact repeats, verb cards already taught (same verb and tense), repeats inside the draft, and near matches. It exits with 1 until the first three are empty. Remove what those three find (and fix the word → sentence order if a word clip goes) and rerun until it passes. Near matches don't fail the check: keep them and list them in the reply.

Without the repo, do the same comparison by hand against `references/a1-1-clip-index.md` and say that only A1.1 was checked.

## 8. Output

- Save it as `a12-tag<N>-clips.json` and send it with SendUserFile.
- When the clips go into the repo as `src/data/levels/<level>/lektion-<N>.json`, run `npm run index:clips` and then `node scripts/check-content-integrity.mjs`. The content check fails while the clip index is out of date, and it lists the missing MP3s.

## 9. Plain-text handoff (only if asked)

For the voice recorder, write two lines per clip with no labels and no separate number line: the filename, then the spoken text, then a blank line. A verb card is followed by its six rows the same way (`a12-tag3-04-du-faehrst.mp3` / `du fährst`).

## 10. Reply

Keep it short:
- The clip count, with verb cards and their row recordings counted separately (e.g. "4 verb cards = 28 recordings").
- How the clips are grouped (ranges of clip numbers).
- **Left out as already taught:** each script with the Lektion it was taught in.
- **Near matches kept:** if any.
- Anything that isn't word for word from the slides: answers you wrote yourself, alternatives you chose, conjugation forms or auxiliaries you filled in, verbs you had to classify, and any Präteritum card the app can't show yet.
