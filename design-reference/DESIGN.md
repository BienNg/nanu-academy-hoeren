---
name: Nordic Cupertino
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#414753'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#717785'
  outline-variant: '#c1c6d6'
  surface-tint: '#005cbb'
  primary: '#0059b5'
  on-primary: '#ffffff'
  primary-container: '#0071e3'
  on-primary-container: '#fcfbff'
  inverse-primary: '#abc7ff'
  secondary: '#5e5e63'
  on-secondary: '#ffffff'
  secondary-container: '#e0dfe4'
  on-secondary-container: '#626267'
  tertiary: '#5a5b60'
  on-tertiary: '#ffffff'
  tertiary-container: '#737478'
  on-tertiary-container: '#fcfbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#abc7ff'
  on-primary-fixed: '#001b3f'
  on-primary-fixed-variant: '#00458f'
  secondary-fixed: '#e3e2e7'
  secondary-fixed-dim: '#c7c6cb'
  on-secondary-fixed: '#1a1b1f'
  on-secondary-fixed-variant: '#46464b'
  tertiary-fixed: '#e2e2e7'
  tertiary-fixed-dim: '#c6c6cb'
  on-tertiary-fixed: '#1a1c1f'
  on-tertiary-fixed-variant: '#45474b'
  background: '#fcf8fb'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  caption:
    fontFamily: Be Vietnam Pro
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2: 0.125rem
  space-4: 0.25rem
  space-8: 0.5rem
  space-12: 0.75rem
  space-16: 1rem
  space-20: 1.25rem
  space-24: 1.5rem
  space-32: 2rem
  space-40: 2.5rem
  space-48: 3rem
  space-64: 4rem
  gutter-mobile: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin-mobile: 1rem
  margin-tablet: 2rem
  margin-desktop: auto
---

## Brand & Style

This design system delivers an authoritative, distraction-free educational experience modeled on premium Cupertino editorial utilities (such as Apple Books, Swift Playgrounds, and Apple Developer). The design ethos balances meticulous restraint with cognitive clarity, built expressly for cross-linguistic acquisition between Vietnamese and German.

### Personality and Tone
- **Calm and Intentional:** Visual silence supersedes ornament. Whitespace serves as an active structural element, lowering cognitive load during rigorous grammatical exercises.
- **Precise and Human:** Modernist typographic discipline paired with soft, approachable curvature ("squircles") creates an inviting, scholarly atmosphere.
- **Direct Feedback Loop:** Interactions are tactile, crisp, and predictable. Color serves exclusively as information architecture—directing attention, validating syntax, and charting mastery.

### Visual Style
- **Cupertino Native Minimalism:** Pure white planar surfaces elevated over neutral warm-gray foundations, subtle hairline dividers, zero skeuomorphic gradients, and focused, dynamic contrast.

## Colors

The color system relies on high-contrast legibility, tonal layering, and targeted system feedback. Hue is reserved strictly for interactive affordances and pedagogical confirmation.

### Core Roles
- **Canvas Base (`#F5F5F7`):** The foundational substrate across all viewports.
- **Card / Primary Surface (`#FFFFFF`):** Floated foreground elements containing modules, practice cards, and active lesson prompts.
- **Secondary Surface (`#E8E8ED`):** Inset controls, unselected pill backgrounds, scrubbers, and audio transcript trays.
- **Primary Text (`#1D1D1F`):** Deep carbon for headlines, German target phrases, and critical grammatical markers.
- **Secondary Text (`#86868B`):** Neutral gray for translations, phonetic transcripts, and secondary metadata.
- **Primary Accent (`#0071E3`):** Interactive focal points, CTA fills, primary active states, and audio playback scrubbers.

### Feedback Tokens
- **Success / Validated (`#34C759`):** Accent for correct grammatical declensions, successful exercises, and streak milestones.
- **Error / Correction (`#FF3B30`):** Applied to incorrect submissions, critical hints, and pronunciation disparities.
- **Warning / Accent (`#FF9500`):** Grammatical gender anomalies, idiomatic exceptions, and attention callouts.

## Typography

The typographical pairing solves a dual linguistic challenge: high-clarity rendering of complex Vietnamese tone diacritics (dấu sắc, dấu huyền, dấu hỏi, dấu ngã, dấu nặng) paired with extended German compound nouns (e.g., *Vergangenheitsbewältigung*).

- **Plus Jakarta Sans (Headlines & Labels):** Provides geometric, friendly geometry akin to Apple’s rounded system type. Tracking is kept slightly tightened across display sizes to maintain unity.
- **Be Vietnam Pro (Body & Explanatory Prose):** Designed specifically with tall ascenders and dedicated vertical clearances to eliminate vertical clipping of multi-tier Vietnamese tone marks while offering clear open apertures for long German word sequences.
- **Vertical Metrics:** Body line heights are set between 1.5× and 1.6× base sizing to prevent collision between stacked Asian diacritics and capitalized Germanic prefixes.

## Layout & Spacing

The layout philosophy mirrors native iOS and macOS modular dashboards: structured, unified, and centered around floating card stacks.

### Responsive Grid System
- **Mobile (< 768px):** 4-column fluid layout with `16px` margins and `16px` gutters. Primary lesson modules stack single-column with floating bottom-anchored action bars.
- **Tablet (768px – 1024px):** 8-column layout with `32px` margins and `24px` gutters. Split screen enables simultaneous vocabulary exploration and exercise feedback.
- **Desktop (> 1024px):** 12-column layout bounded by a max container width of `1120px`. The interface docks a left-hand navigation sidebar (`260px` fixed) alongside a centered learning canvas (`680px` centered) and an optional contextual grammar inspector.

### Spacing Rhythm
Every layout gap, padding increment, and margin conforms to an 8-point base scale (`4px` reserved for precise inline text-to-icon alignments). Content sections are separated by generous gaps (`space-32` to `space-48`) to retain the calm, meditative atmosphere of an editorial reader.

## Elevation & Depth

This system avoids layered dark shadows, instead adopting Cupertino’s optical physics: lightweight luminescence, soft ambient occlusion, and razor-sharp hairline borders.

### Surface Tiers
1. **Tier 0 (Canvas):** Base level `#F5F5F7`. Non-interactive backdrop.
2. **Tier 1 (Surface Cards):** `#FFFFFF` paired with a 1px composite outline (`rgba(0, 0, 0, 0.05)`) and an ultra-diffused shadow: `box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02)`.
3. **Tier 2 (Interactive Floating / Active State):** Lifted prompt tokens, dragging chips, and active lesson inputs: `box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.03)`.
4. **Tier 3 (Modals & Sheet Overlays):** `#FFFFFF` anchored over blurred backdrop (`backdrop-filter: blur(20px); background-color: rgba(245, 245, 247, 0.8)`). Hairline separators demarcate sections.

### Hairline Borders
Dividers, card bounds, and grouped list boundaries utilize an ultra-subtle stroke: `1px solid #E5E5EA` (or `rgba(0, 0, 0, 0.06)`).

## Shapes

The design system incorporates continuous corner geometry ("squircle" styling) to deliver tactile, friendly interface containers without sacrificing structural discipline.

### Geometry Hierarchy
- **Cards & Learning Units:** `rounded-3xl` (24px to 28px). Applies to exercise boards, vocabulary prompt containers, and progress sheets.
- **Interactive Action Buttons & Secondary Cards:** `rounded-2xl` (16px to 20px). Provides a uniform touch affordance across medium-sized targets.
- **Pills, Audio Controls, & Word Tokens:** Full circular rounding (`rounded-full` / 9999px). Applied to selectable answer chips, grammar gender badges, and playback triggers.
- **Form Controls & Embedded Inputs:** `rounded-xl` (12px) with crisp 1px hairline insets.

## Components

### Buttons
- **Primary CTA:** Deep blue fill (`#0071E3`), pure white label (`label-lg`), height `52px`, `rounded-2xl`. On hover/focus: scaled opacity (`opacity: 0.95`). Pressed state triggers subtle physical scale down (`transform: scale(0.98)`).
- **Secondary Action:** Subdued gray fill (`#E8E8ED`), near-black label (`#1D1D1F`), height `48px`, `rounded-2xl`.
- **Ghost / Text Button:** Zero background, blue text (`#0071E3`), padded with `8px 16px`, `rounded-lg`.

### Interactive Vocabulary & Answer Chips
- Selectable word tokens for sentence construction exercises.
- Base state: `#FFFFFF` fill, 1px hairline border `#E5E5EA`, text `#1D1D1F`, `rounded-full`, padding `10px 20px`.
- Active/Selected state: `#0071E3` background, `#FFFFFF` text, border `#0071E3`.
- Correct state: `#34C759` background, `#FFFFFF` text.
- Incorrect state: `#FF3B30` background, `#FFFFFF` text.

### Cards & Exercise Containers
- Base: Pure white `#FFFFFF`, `rounded-3xl`, 1px border `rgba(0,0,0,0.05)`, diffused ambient shadow.
- Interior layout: Generous internal padding (`32px` desktop, `20px` mobile).
- Structure: Clear separation between source stimulus (e.g., German audio/text) and target response (Vietnamese translation) using subtle horizontal rules (`#E5E5EA`).

### Lists & Vocab Groupings
- Native iOS-style inset grouped lists.
- Background: `#FFFFFF` card containing stacked items separated by full-width or inset `1px` hairlines (`#E5E5EA`).
- List Item: Minimum height `56px`, flex layout with trailing chevron or metadata (`#86868B`).

### Audio Pronunciation Controllers
- Dedicated listening player for German phonetics.
- Minimal circular control: `44px` diameter, `#E8E8ED` background, `#0071E3` vector waveform or speaker icon, expanding dynamic wave pill when actively speaking.

### Input Fields
- Fill: `#FFFFFF`, border: `1.5px solid #E5E5EA`, `rounded-xl`, padding `14px 18px`.
- Typography: `body-lg` in `#1D1D1F`.
- Focus state: Border transitions smoothly to `#0071E3` with an outer halo of `rgba(0, 113, 227, 0.15)`.
- Placeholder: `#86868B`.

### Checkboxes & Radio Controls
- Native style rounded rings. Checked state displays `#0071E3` fill with a crisp white tick mark; radio buttons feature a solid inner white dot enclosed by `#0071E3`.