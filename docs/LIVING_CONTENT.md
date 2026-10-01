# Leben in Deutschland — content guide

A workplace (Nagelstudio, Restaurant, …) is a list of **scenes**. A scene works like a
Lektion: Study first, then Practice with hearts, parts and XP.

## Files

| What | Where |
|---|---|
| Workplace list | `src/data/living/workplaces.json` |
| Scenes and clips | `src/data/living/<slug>.json` (e.g. `nagelstudio.json`) |
| Audio | `public/audio/living/<slug>/<filename>.mp3` |
| Pictures (optional) | `public/images/living/<slug>/<image>` (webp, png or jpg) |

A clip without its MP3 is skipped. A scene with no playable clip is hidden, and a workplace
with no playable scene is hidden from Home. Run `npm run check:content` after editing.

## workplaces.json

```json
[
  { "id": "nagelstudio", "slug": "nagelstudio", "label": "Nagelstudio", "labelVi": "Tiệm nail", "icon": "back_hand", "finishTitle": "Bereit für den Salon!" }
]
```

- `slug`: lowercase letters, digits and hyphens. It names the JSON file, the audio folder and the access flag.
- `icon`: optional [Material Symbols](https://fonts.google.com/icons) name.
- `finishTitle`: optional title of the trophy at the end of the path (default "Bereit für die Arbeit!").

## <slug>.json

```jsonc
{
  "scenes": [
    {
      "id": "bezahlen",            // lowercase, unique in this file; never rename once students have progress
      "label": "Bezahlen",
      "labelVi": "Thanh toán",     // optional
      "clips": [ /* see below */ ]
    }
  ]
}
```

Scenes appear in file order.

## Clip types

Every clip needs `filename` and `script`, and should have `translationVi`. Each clip gets the
normal practice cards from the Levels track (dictation, word order, multiple choice, …). Add
**one** of the fields below to give a clip an extra workplace card.

### Normal clip

```json
{ "filename": "nagel-termin-01.mp3", "script": "Guten Tag, haben Sie einen Termin?", "translationVi": "Xin chào, chị có lịch hẹn không ạ?" }
```

### "Was sagst du?": pick the right reply

The student hears the line, then picks the reply that fits. Exactly one reply has
`"correct": true`. `whyVi` explains in Vietnamese why a wrong reply does not fit (too informal,
off-topic, rude, …) and is shown after a wrong pick. Use 3 replies.

```json
{
  "filename": "nagel-bezahlen-02.mp3",
  "script": "Kann ich mit Karte zahlen?",
  "translationVi": "Tôi trả bằng thẻ được không?",
  "replies": [
    { "text": "Ja, natürlich. Halten Sie die Karte einfach hier dran.", "correct": true },
    { "text": "Ja, gib mal her.", "whyVi": "Quá suồng sã với khách." },
    { "text": "Das macht fünfunddreißig Euro.", "whyVi": "Không trả lời câu hỏi của khách." }
  ]
}
```

### Zahlen-Ohr: hear a number, type it

Replaces the dictation card: the student types only the number. Prices, times, room numbers.

```json
{ "filename": "nagel-bezahlen-01.mp3", "script": "Das macht fünfunddreißig Euro fünfzig.", "translationVi": "…", "answer": "35,50" }
```

These all count as correct for `"35,50"`: `35,50`, `35.50`, `35,5`, `35,50 €`.
For `"15:30"`: `15:30`, `15.30`, `15:30 Uhr`. For `"35"`: `35` or `35,00`.

### Bild-Vokabeln: picture in pairing cards

Short words (up to 3 German words) with a translation are dealt as pairing cards, 5 at a time.
With `image`, the picture shows instead of the Vietnamese text. Put the file in
`public/images/living/<slug>/`. A missing picture falls back to the text.

A pairing card needs 5 short words **in the same practice part**. Long scenes are split into
parts of up to 15 cards, so keep picture words together, ideally in a vocabulary scene of
their own (see `werkzeug` in the sample file).

```json
{ "filename": "nagel-beratung-03.mp3", "script": "die Nagelfeile", "translationVi": "cái dũa móng", "image": "nagelfeile.webp" }
```

## Access

Admins grant each workplace separately in **Admin → Access** (the "Leben in Deutschland"
toggles). The flag is stored as `living-<slug>` in the same list as the level grants.

## Ranking

Practice and Study XP count on the global leaderboard. Students with Living access and no real
class are grouped as one class per workplace on the class leaderboard, so they compete with
each other. That virtual class is only for the leaderboard: those students get no duels or
Blitzrunde.
