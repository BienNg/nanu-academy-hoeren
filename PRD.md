# NaNu Academy Hören — PRD

## Problem
Listening comprehension is the weakest skill for NaNu NaNa's Vietnamese students, and the least-served by generic language apps (Duolingo, Babbel, etc.). Classroom time is limited, and no existing tool combines CEFR-level dictation practice with Ausbildung-profession-specific interview prep tailored to the Vietnamese-to-German pipeline.

## Users
**Phase 1:** NaNu NaNa's own A1–B1 students (Saigon, Hanoi, online) — a captive, motivated audience already enrolled in courses and Ausbildung placement.

**Phase 2:** Any Vietnamese learner of German nationwide preparing for a Goethe/telc/ÖSD exam or an Ausbildung interview, whether or not they're a NaNu NaNa student.

## Outcomes
- Students measurably improve listening/dictation accuracy at each CEFR level.
- Ausbildung candidates walk into interviews having already "heard" the vocabulary of their trade.
- NaNu NaNa strengthens its brand as a practical, outcomes-driven school and deepens student trust and retention — the tool exists to build skill and goodwill, not to generate direct revenue.
- The app remains fully open to every student who uses it: no paid tiers, no feature gating, no upsell path. Every learner gets the same experience regardless of enrollment status or ability to pay.

## Core Structure

**1. General Track — A1 to B1**
- Chapters organized by CEFR level (A1, A2, B1), matching NaNu NaNa's own course levels
- Each chapter contains multiple short audio clips (dialogues, announcements, everyday scenarios), increasing in length/speed/vocabulary difficulty as the learner progresses
- Progress tracked per chapter and per level

**2. Ausbildung Interview Track — by profession**
- Separate category for each Ausbildungsberuf: Restaurantfachkraft, Hotelfachkraft, Koch, Bäcker, Metzgerei, expandable to others
- Audio content simulates real interview questions and workplace vocabulary specific to each trade

## Features (high-level, not implementation)
1. **General Track**: A1–A2–B1 chapters, each with ordered audio clips.
2. **Dictation session**: play/pause/replay/slow-down, type transcript, get word-level feedback and an accuracy score, retry or advance.
3. **Ausbildung Interview Track**: same session mechanic, content organized by profession.
4. **Progress tracking** per chapter/profession, home screen "continue learning."
5. **One unified experience for everyone** — every chapter and track is available to every user from day one; there is no premium content, paid unlock, or usage limit.

## Explicit Non-Goals for MVP
- No monetization, subscriptions, paywalls, or tiered access of any kind.
- No speech recognition/ASR — typed dictation only, checked against a fixed script.
- No Firebase, no Figma round-trip, no multi-branch git process for a solo build.

## Why NaNu NaNa Is Positioned to Build This
- Existing A1–B1 curriculum and teaching staff to source and vet audio scripts
- Years of Ausbildung placement experience across exactly these professions
- An existing student base to launch and iterate with
- A brand built around radical transparency and practical outcomes — a natural fit for a tool about measurable skill-building, not gamified fluff or monetization

## Constraints and Dependencies
**Technical boundaries:**
- No Firebase, anywhere in the stack.
- Hosting on Vercel.
- Audio served from `/public` for MVP, kept under a 1GB total budget (migrate to Cloudflare R2 later only if that budget or a no-code-deploy content need is hit).
- Animation handled with GSAP.
- No speech recognition/ASR — typed dictation checked against a fixed script only.

**Budget:**
- Effectively $0 — free-tier tools and services only. Any choice of hosting, storage, or third-party service must fit within free-tier limits (e.g. Vercel Hobby plan, /public asset hosting instead of paid storage).

## Next Steps
- Scope MVP: which chapters/levels and which 2–3 Ausbildungsberufe launch first
- Source/record initial audio scripts with the teaching team
- Confirm tech stack and timeline for the Phase 1 pilot with NaNu NaNa students
