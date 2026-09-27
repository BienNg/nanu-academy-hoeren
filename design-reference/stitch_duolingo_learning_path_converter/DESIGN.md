---
name: Vibrant German Journey
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3e4850'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6e7881'
  outline-variant: '#bec8d2'
  surface-tint: '#006591'
  primary: '#006591'
  on-primary: '#ffffff'
  primary-container: '#0ea5e9'
  on-primary-container: '#003751'
  inverse-primary: '#89ceff'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#006c49'
  on-tertiary: '#ffffff'
  tertiary-container: '#00b17b'
  on-tertiary-container: '#003b26'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c9e6ff'
  primary-fixed-dim: '#89ceff'
  on-primary-fixed: '#001e2f'
  on-primary-fixed-variant: '#004c6e'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 36px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system crafts an energetic, approachable, and tactile language learning experience centered around structured progression (A1 to C2) through German. Taking the engaging momentum of modern gamified apps and evolving it with a fresh, airy palette, it trades monotonous neon greens for brilliant sky-blue and cyan tones balanced by rich navy neutrals and celebratory golden accents.

The design movement mixes **Tactile Gamification** with crisp **Modern Minimalism**:
- **Tactile feedback:** Interactive components mimic pressable, physical 3D tokens with solid drop borders (bottom extrusion bevels) rather than blurry drop shadows.
- **Friendly & Inviting:** Generously rounded pill shapes, buoyant icon nodes, and readable geometric typography eliminate the intimidation factor often associated with German grammar.
- **Clear Progress Metaphors:** Clean radial micro-progress meters, achievement stars, and lesson progression nodes make everyday mastery tangible and fun.

## Colors

The palette establishes an invigorating, optimistic atmosphere while providing accessible contrast ratings (WCAG AAA for typography, AA for interactive graphics).

- **Primary (`#0ea5e9` / Sky Blue):** The heartbeat of the app. Represents forward motion, active lessons, interactive primary buttons, and node completion rings. Paired with a deeper shade (`#0284c7`) for tactile bottom-bevel borders.
- **Secondary (`#f59e0b` / Amber Gold):** Reserved for rewards, streaks, mastery stars, and milestone badges. Infuses high dopamine reward loops.
- **Tertiary (`#10b981` / Emerald Mint):** Used for correct validation states, celebration banners, and success feedback.
- **Neutral (`#0f172a` / Deep Slate):** Deep navy tone providing high-contrast clarity against crisp white cards (`#ffffff`) and cool cloud-tinted app canvas backdrops (`#f8fafc`).
- **Surface & Stroke Tiers:** Inactive lesson nodes and locked paths use cool slate gray (`#e2e8f0` and `#94a3b8`), allowing unlocked sky-blue nodes to pop effortlessly.

## Typography

**Plus Jakarta Sans** is utilized universally across headline, body, and label roles. Its wide aperture, geometric clarity, and subtly rounded terminals strike the ideal balance between playful gamification and crisp educational readability—vital for reading compound German words (e.g., *Personalpronomen*, *Verbkonjugation*).

- **Headlines:** Set in Bold (700) or ExtraBold (800) with snug line height to anchor module modules and level units cleanly.
- **Body & Labels:** Employs Medium (500) and Bold (700) weights to keep tiny sub-labels ("2 study runs", "1 listening run") sharp and immediately glanceable without optical muddiness.

## Layout & Spacing

The layout is built around a single-column, center-anchored journey feed for mobile devices (max-width `480px`), adapting to a multi-column modular dashboard layout on desktop screens (max-width `1024px`).

- **Grid Model:** Modular cards stack vertically along the learning path with a uniform gap of `space-md` (`1rem`) to `space-lg` (`1.5rem`).
- **Internal Card Flow:** Each lesson card maintains generous internal padding (`space-lg`), grouping the title and completion state at the header while spreading interactive lesson circular nodes in an evenly spaced horizontal row or dynamic learning zigzag.
- **Rhythm:** Spacing follows an 8-point system with 4-point micro-adjustments for tight label-to-icon locks (`space-xs` and `space-sm`).

## Elevation & Depth

Depth in this design system avoids blurry, heavy drops in favor of crisp, tactile extrusion techniques derived from premium game interfaces:

- **Tactile Extrusion (3D Bevels):** Interactive elements—such as primary action buttons and lesson nodes—feature a solid bottom border (`2px` to `4px` width) in a darker shade of their parent color (e.g., `#0ea5e9` surface with `#0284c7` bottom stroke). On `:active` press, elements translate down `2px`, reducing the border and providing authentic physical feedback.
- **Level Cards:** Resting module cards sit on pure `#ffffff` with a crisp `1.5px` border of `#e2e8f0` and an ultra-soft diffuse ambient shadow (`box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.04)`), creating separation from the canvas without visual clutter.
- **Completed & Star Badges:** Floating status badges (achievement stars, action arrows) use subtle tonal container fills (`#fef3c7` for gold badges, `#f1f5f9` for navigational actions) with high-contrast glyphs.

## Shapes

The shape system adopts a pill-centric, hyper-friendly posture (`roundedness: 3`). 

- **Cards & Modules:** Enclosed within `rounded-xl` boundaries (`24px` to `32px` corner radiuses) that look approachable and shield the interface from harsh clinical edges.
- **Action Buttons & Chips:** Pure pill capsules (`border-radius: 9999px`) designed to be thumb-friendly.
- **Nodes & Counters:** Circular geometry (`56px` to `64px` perfect circles) with concentric circular progress tracks indicating lesson repetition completion.

## Components

### Lesson Cards
- **Structure:** White container with `24px` corner radius, surrounded by a subtle `1px` border (`#e2e8f0`).
- **Header:** Features lesson identifier (e.g., "A1.1 - Lektion 1") in `headline-md` alongside a top-right milestone token (e.g., golden circle containing an amber star `#f59e0b` or navigation arrow in neutral circle `#f1f5f9`).
- **Node Row:** Horizontal flex container featuring the interactive learning units.

### Learning Nodes (Lesson Circles)
- **Active / Unlocked:** `56px` circular surface in white or sky-blue tint, surrounded by an active `#0ea5e9` progress ring (using SVG stroke-dasharray) or a solid sky-blue border. Icons (play, book, headphones) are centered with bold strokes.
- **Completed:** Fully filled sky-blue circle (`#0ea5e9`) with white vector icons and optional 3D bottom-offset depth.
- **Locked / Inactive:** Muted slate surface (`#f1f5f9`) with slate-gray icon (`#94a3b8`) and empty track (`#e2e8f0`).
- **Node Captions:** Anchored below each node with `space-xs` distance. The primary label uses `label-md` and numeric progress uses `label-sm` in slate gray (`#64748b`).

### Buttons
- **Primary:** Full pill capsule in `#0ea5e9` with bold white text, supported by a `4px` solid bottom extrusion border in `#0284c7`. Active state translates `y: 2px` and shrinks bottom border to `2px`.
- **Secondary:** White pill capsule with a `2px` solid border in `#e2e8f0` and a `3px` bottom border in `#cbd5e1`. Slate text (`#334155`).
- **Reward / Celebration:** Amber gold `#f59e0b` with `#d97706` extrusion for streak boosts and chest unlocks.

### Progress Chips & Streak Counters
- Compact capsule containers with translucent tinted backgrounds (`#e0f2fe` for cyan, `#fef3c7` for streak flame).
- Holds micro-glyphs (fire, gems, hearts) paired with `label-lg` typographic counts.

### Radio & Exercise Choice Cards
- Option tiles inside quizzes use full-width rounded pill containers with a `2px` border.
- Unselected: White background with `#e2e8f0` stroke.
- Selected: Tinted `#f0f9ff` surface with bold `#0ea5e9` outline and extruded shadow.
- Correct / Incorrect: Green `#10b981` or Coral `#ef4444` borders with instant haptic pulse.