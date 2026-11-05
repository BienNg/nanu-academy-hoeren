---
name: a11-tense-card-audit
description: Analyze an A1.1 lesson JSON for tense-specific conjugation coverage and optionally clean up regular Prasens cards. Use for lessons after Lektion 17 when the user asks to audit Present vs Perfect verb coverage, dedupe against previous lessons, insert only new cards, remove clips whose script already appears in an earlier lesson, or remove regular-verb Prasens conjugation while keeping Perfekt and non-regular Prasens.
disable-model-invocation: true
---

# A1.1 Tense Card Audit

Use this skill for two tasks on one A1.1 lesson file:

- **Audit mode:** add only needed tense cards.
- **Cleanup mode:** remove regular-verb Prasens `conjugation` blocks while keeping Perfekt and non-regular Prasens.

Scope: `src/data/levels/a1-1/lektion-18.json` and later.

## Modes

Select one mode from the user request before editing:

- `audit`: detect tense usage and add missing cards.
- `cleanup-regular-praesens`: remove only regular-verb Prasens `conjugation`.

If the request is ambiguous, ask which mode to run.

## Goal (Audit Mode)

For verbs that appear in lesson sentences:

1. Detect whether each verb appears in **Prasens** and/or **Perfekt**.
2. Add tense cards for the detected tense only when that **lemma + tense card** does not already exist in earlier A1.1 lessons.
3. Keep placement near first appearance of that verb-tense in the target lesson.
4. Do **not** add Prasens conjugation cards for regular verbs.

## Rules To Follow (All Modes)

- Treat sentence verbs as **all verbal forms**:
  - finite forms
  - infinitives
  - participles
- Cross-lesson dedupe is based on **existing cards in earlier lessons**, not sentence presence.
- Keep added cards near the first relevant sentence in lesson order.
- If row audio is missing, still add the card (`filename` values can exist before audio files).
- For Lektion 17+ policy used in this workspace:
  - keep Prasens conjugation for non-regular verbs
  - do not add Prasens conjugation for regular verbs in audit mode
  - remove Prasens conjugation for regular verbs when cleanup is requested
  - keep Perfekt cards
- Before any mode-specific edit, remove target clips whose `script` already appears in an earlier A1.1 lesson. See **Duplicate clips**.

## Duplicate clips

Run this in every mode, before adding cards or stripping conjugations.

A clip was already used when an earlier `lektion-*.json` (lower number, same `src/data/levels/a1-1/` folder) has a clip with the same `script`.

Compare scripts after trim, collapsing whitespace, and lowercasing. The whole script must match. A shared word inside a longer sentence is not a match.

When it matches:

- Remove the entire target clip, including `conjugation` and `perfectConjugation`.
- Keep the earlier lesson's copy.
- If the target has two clips with the same new script, keep the first.

Report every removal as `script` plus the earliest lesson number. Do not delete on a near-match (punctuation-only or lemma-only); list those under `Assumptions` instead.

## Card Types

- Prasens card:
  - clip has `conjugation`
  - clip `script` is infinitive lemma (e.g. `finden`)
- Perfekt card:
  - clip has `perfectConjugation`
  - clip `script` is typically Partizip II (e.g. `gefunden`)
  - `translationVi` should include `Partizip II của <lemma>`

## Workflow (Audit Mode)

Copy this checklist and complete each step:

```text
Tense Audit Progress
- [ ] 1) Load target lesson and previous lessons
- [ ] 2) Remove clips whose script already appears in an earlier lesson
- [ ] 3) Build prior-card index (lemma + tense)
- [ ] 4) Extract sentence verbs and tense appearances
- [ ] 5) Produce candidate additions
- [ ] 6) Ask focused clarifications if needed
- [ ] 7) Edit JSON (insert near first appearance)
- [ ] 8) Validate JSON and report summary
```

### 1) Load Files

- Target: one `lektion-XX.json` in `src/data/levels/a1-1/`
- Previous lessons: all `lektion-*.json` with lower number in same folder.

### 2) Remove duplicate clips

Follow **Duplicate clips**. Do this before building the prior-card index, so removed sentences are not treated as appearances in the target lesson.

### 3) Build Prior-Card Index

Maintain two sets from previous lessons:

- `presentCardLemmas`
- `perfectCardLemmas`

How to collect:

- `conjugation` clip:
  - lemma = `clip.script` (infinitive)
  - add to `presentCardLemmas`
- `perfectConjugation` clip:
  - parse lemma from `translationVi` pattern: `Partizip II của <lemma>`
  - add parsed lemma to `perfectCardLemmas`

If a perfect lemma cannot be parsed safely, do not guess silently; flag it in notes.

### 4) Extract Sentence Verb Appearances

From target lesson sentence clips, detect verb appearances and tense:

- Prasens appearance:
  - finite present forms
  - modal + infinitive constructions
- Perfekt appearance:
  - auxiliary (`haben`/`sein`) + Partizip II construction

Track first appearance position for each `(lemma, tense)`.

Use nearby lesson context to resolve lemma (e.g. infinitive clips, paired example lines).

### 5) Produce Candidate Additions

For each detected `(lemma, tense)`:

- Add Prasens card only if:
  - tense appears in target, and
  - lemma not in `presentCardLemmas`, and
  - lemma is non-regular in Prasens
- Add Perfekt card only if:
  - tense appears in target, and
  - lemma not in `perfectCardLemmas`

Regular Prasens lemmas must be listed as skipped, not added.

### 6) Clarifications Before Editing

Ask concise questions if any of these are ambiguous:

- whether a borderline verb should count as regular vs irregular
- uncertain lemma mapping from sentence form
- card placement when multiple first appearances tie

If no ambiguity, proceed without blocking.

### 7) Edit JSON

- Insert new card clips near first relevant sentence.
- Preserve valid JSON and existing order style.
- Duplicate-clip removal is the only deletion in audit mode.

Filename convention for new helper cards:

- Prasens card clip id prefix: `a11-tagXX-pNN-...`
- Perfekt card clip id prefix: `a11-tagXX-kNN-...`

Row filenames should match clip prefix and person.

### 8) Validate + Report

- Validate JSON parse.
- Summarize:
  - which clips were removed because their script already appears in an earlier lesson
  - which cards were added
  - which were skipped due to prior-card dedupe
  - any unresolved assumptions

## Cleanup Mode: Remove Regular Prasens

Run this section only when user asks to remove regular Prasens conjugations.

### Cleanup classification

Keep Prasens `conjugation` for non-regular verbs:

- stem-vowel/stem-consonant change in present forms
- strong/mixed irregular present patterns
- separable verbs with irregular stem behavior

Remove Prasens `conjugation` for regular verbs:

- standard `-e/-st/-t/-en/-t/-en` patterns
- regular separable verbs with regular stem behavior

If unsure, ask before editing.

### Cleanup workflow

```text
Regular Prasens Cleanup Progress
- [ ] 1) Load target lesson and previous lessons
- [ ] 2) Remove clips whose script already appears in an earlier lesson
- [ ] 3) List remaining clips with `conjugation`
- [ ] 4) Classify regular vs non-regular
- [ ] 5) Ask clarifying questions for borderline verbs
- [ ] 6) Remove only regular-verb `conjugation`
- [ ] 7) Validate JSON and report summary
```

### Cleanup reporting

- `Removed (already in previous lessons):` list of `script` plus earliest lesson
- `Removed regular Prasens from:` list
- `Kept non-regular Prasens for:` list
- `Assumptions:` list

## Output Format For User Updates

When reporting results in audit mode, use:

- `Removed (already in previous lessons):` list of `script` plus earliest lesson
- `Added:` list of `(lemma, tense)`
- `Skipped (already in previous lessons):` list
- `Assumptions:` list

