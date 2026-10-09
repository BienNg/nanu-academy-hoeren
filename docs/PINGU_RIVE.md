# Pingu in Rive

Pingu's poses are SVGs animated with CSS loops (`src/components/session/Pingu.tsx`, `.pingu-*` in `globals.css`). Each pose can be replaced with a Rive artboard, so he moves with bones, mesh deformation, and a state machine instead of fixed loops. Nothing changes until the file ships.

## How it works
- The app fetches `public/rive/pingu.riv` once per page. If the fetch fails, every pose stays an SVG, and neither the Rive runtime (230 KB) nor its WASM (2 MB) downloads.
- When the file loads, each pose looks up its artboard by name. A missing artboard or state machine logs `Invalid artboard name` or `State Machine with name Pingu not found` in the console, and that pose keeps its SVG. Artboards can ship one at a time.
- The WASM is bundled from `@rive-app/canvas` and served from our own `/_next/static/media`, not unpkg.
- Students who prefer reduced motion always get the still SVG.
- The canvas never takes clicks (`pointer-events: none`, Rive listeners off), so it can overhang the path buttons.

## Artboards
One `.riv` file. Every artboard plays a state machine named **`Pingu`** and has a transparent background.

| Artboard | Where it shows | Size |
| --- | --- | --- |
| `tea`, `balloon`, `pickleball`, `pingpong`, `cups`, `pen`, `cube`, `music`, `pool`, `peekaboo` | Beside each Lektion on the path, quests, duels, part complete | 360 × 370 |
| `reading` | Vocabulary sheet on the level page | 360 × 370 |
| `cheering` | Passed run, jump test intro | 360 × 370 |
| `oops` | Practice run out of hearts, quit dialog | 360 × 370 |
| `celebrate-1` … `celebrate-4` | Badge unlock, one per tier (Đồng, Bạc, Vàng, Kim cương) | 280 × 300 |

**Framing.** The 360 × 370 artboards hold the 240 × 250 pose from the mascot sheet with 60 px of room on each side, so the pose's (0, 0) sits at (60, 60). Balloons, balls, notes, and confetti can use that room. The celebrate artboards match the badge sheet's `-20 -50 280 300` frame exactly, so its (0, 0) sits at (20, 50). Draw the ring and confetti, but not the medal: the unlock screen draws the medal on top and expects Pingu's entrance to keep the timing of the `pingu-cele-*` keyframes in `globals.css`.

The art references are in `design-reference/Penguin mascot sheet-html-fix`, `Chilling and cute poses-html`, `Hobby poses-html` and `Unlock celebration-html`.

## Data binding
Each artboard's default view model can have these properties. The app auto-binds the default instance, and properties it doesn't find are skipped.

| Property | Type | Set by the app |
| --- | --- | --- |
| `locked` | Boolean | `true` on a path Lektion that isn't open yet. The app already greys the canvas out; this is for a dozing or waiting pose. |

Use data binding, not state machine inputs, which this runtime version deprecates.

## Animation notes
These are what the CSS loops can't do, and why the file exists:
- No fixed rhythm. Use random blend states or random timers for blinks (sometimes doubled), glances, weight shifts, and small idle actions.
- Overlapping action. The body leads; flippers trail by a few frames and overshoot; the head tuft settles last.
- Gravity. Ease out going up and ease in coming down, then squash on contact. Don't ease into the floor.
- Pose to pose. Hit a pose, hold it with slight drift, then move. Avoid constant back-and-forth swings.
- Eyes snap to a new spot and hold.

## Trying it locally
Put the file at `public/rive/pingu.riv` and reload. Small poses draw at twice the screen's pixel density because callers scale them up to 1.9×.
