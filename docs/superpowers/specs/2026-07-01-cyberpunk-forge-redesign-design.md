# Cyberpunk Forge — visual & UX redesign (v4)

**Status:** design approved (palette + homepage flow), pending spec review
**Owner:** Mikhail (Track A / client)
**Date:** 2026-07-01

## Problem

Three concrete complaints from the product owner:

1. **The orange identity is weak.** The molten-amber accent (`--forge #ff7a1f`) does not
   grab the eye. We want a **cyberpunk** look — high-contrast neon on near-black.
2. **The homepage is backwards.** A first-time visitor lands on a big rotating robotic
   hand + a "What do you want to make today?" essay. A 3D-generation site must put the
   **generator input first** — like Meshy's `/discover`: land → immediately see a box to
   type a prompt or drop an image, with a rich gallery of *many* community models below.
   Not one hand nobody can act on, not marketing paragraphs.
3. **The Forge page buries the action.** The default robotic hand fills ~80% of the
   screen; the upload/generate controls are a narrow side panel. A user who clicks
   "Start from image" should land on a screen where the **upload/prompt surface is the
   hero**, not a random pre-loaded model. New concept needed for the left panel / layout.

Plus: community cards should reach Meshy-grade polish (neon-edged, generation-type tag,
@nick + avatar, likes/views). This is all client-side — **no dependency on Track B (Javid)**.

## Goals

- A cohesive **cyberpunk (Neon Noir)** design system applied globally.
- Homepage that IS the generator: prompt/image console first, big model gallery below.
- Forge reworked into a 3-zone workspace with a **create-first** empty state.
- Community cards that look native and premium.

## Non-goals / constraints (hard)

- **Keep mock mode working key-free.** Every flow must work without `MESHY_API_KEY`.
- **No scraping** Meshy's models/images/assets — own/generated/CC content only.
- **Coins stay simulated** — no real payments.
- **Don't break** `npm --prefix server test` (53/53) or `npm --prefix client run build`.
- **No new backend required** for phases 1–4. Track B asks (if any) are future/optional.
- Preserve existing capability: spatial click-to-edit, compare, history, publish — they
  move/reshape but are not removed.

## Decisions (locked)

- **Palette:** A · **Neon Noir** — cyan primary, magenta secondary, violet tertiary, on
  near-black.
- **Homepage generate flow:** the homepage console does **not** run its own engine. Typing
  a prompt / dropping an image + Generate **navigates into Forge and auto-starts** there.
  One generation engine, zero duplication.

---

## Design system — "Neon Noir"

Implemented by **remapping the existing CSS custom properties in `client/src/index.css`**
so most of the app recolors from one place (low-risk global swap). Variable *names* stay;
their *values* change.

| Token | Old (orange) | New (Neon Noir) | Role |
|---|---|---|---|
| `--bg` | `#0b0d12` | `#06070d` | app background (deeper) |
| `--panel` | `#12151d` | `#0c0f18` | card / panel surface |
| `--panel-2` | `#171b25` | `#141a26` | raised surface |
| `--line` | `#242a37` | `#1c2740` | borders |
| `--line-soft` | `#1b202b` | `#141a28` | soft dividers |
| `--forge` | `#ff7a1f` | `#22d3ee` | **primary action + brand** (cyan) |
| `--forge-2` | `#ffab5e` | `#67e8f9` | primary hover/light |
| `--forge-deep` | `#d65a0a` | `#0891b2` | primary pressed |
| `--forge-glow` | rgba amber | `rgba(34,211,238,0.45)` | glow shadow |
| `--steel` | `#5cc8ff` | `#ff2d9b` | **secondary accent** / focus / selection / likes (magenta) |
| `--steel-soft` | rgba blue | `rgba(255,45,155,0.14)` | secondary tint |
| `--violet` (new) | — | `#a855f7` | tertiary accent (tags, wireframe) |
| `--text` / `--text-dim` / `--text-faint` | keep | keep (cool greys) | text ramp |

Text ramp stays cool grey (already fine on the darker bg). Semantic `--danger`/`--good`/
`--star` unchanged.

**Treatments (new, additive):**
- **Glow on primary:** `.submit` gets an always-on subtle cyan glow, stronger on hover.
- **Neon text:** brand wordmark + page `h1`/section headings get a soft cyan/magenta
  text-shadow (tasteful, not blurry).
- **Neon card edge:** `.post-card` / panels get a 1px neon-tinted border that intensifies
  (with a faint outer glow) on hover; the existing hover wireframe cross-fade stays.
- **Scanline/grid backdrop:** recolor the existing body blueprint grid to a faint cyan and
  add a very subtle horizontal scanline overlay (low opacity; disabled under
  `prefers-reduced-motion` if animated).
- **Focus ring** (`:focus-visible`, added in A4) switches to magenta so it reads against
  cyan actions.
- **Type:** keep Chakra Petch (display) / Hanken Grotesk (ui) / IBM Plex Mono — Chakra Petch
  is already geometric-techy; tighten letter-spacing on headings for a sharper feel.

Fonts, radius, and layout scaffolding are unchanged, so the swap is mostly value edits +
a handful of new rules.

---

## Homepage — the generator console

Replace the current hero (two navigation cards + rotating hand + theme chips + gallery)
with:

1. **Generator console (hero, centered).**
   - A single prompt `textarea` with a **mode toggle [ Text | Image ]**.
   - Image mode reveals a **drag/drop/click/paste** dropzone (reuse the logic already in
     `GeneratePanel`).
   - A prominent **GENERATE** button (cyan, glowing).
   - Small model-tier hint is optional; keep the console uncluttered.
   - No marketing paragraph. At most a one-line neon tagline.
2. **On submit → navigate to Forge and auto-start:**
   - **Text:** `navigate('/forge?prompt=<encoded>&autostart=1')`.
   - **Image:** upload the file to `POST /api/images` first (B3, already live) → get
     `imageId` → `navigate('/forge?mode=image&imageId=<id>&autostart=1')`.
   - Forge reads these params, prefills `GeneratePanel`, and kicks off generation.
3. **Community gallery below (many models).** Reuse the existing feed fetch + `PostCard`
   grid (with the A4 skeleton). Add a couple of theme chips as a thin strip. This replaces
   the single spinning hand with a wall of real community work.

The rotating-hand showcase is removed from the homepage.

---

## Forge — 3-zone workspace, create-first

Reshape `ForgePage` from "canvas + right sidebar, hand preloaded" into three zones:

- **Left — Options panel.** Generation controls surfaced from `GeneratePanel`: mode
  (Text/Image), model tier (M5/M6 when wired), type (Standard/Low-poly placeholder),
  textures toggle. This is the "what to make" column.
- **Center — Work surface.**
  - **Empty state (no model yet):** a large, obvious **create surface** — the prompt/upload
    dropzone as the hero, with a clear call to action. **No default robotic hand.**
  - **After generation / load:** the 3D canvas (existing `ModelViewer`) with a **topology
    stat badge** (faces/vertices when available) and a compact toolbar (reset / export /
    present). Spatial click-to-edit becomes a **toggleable mode** here, not the default
    front door.
- **Right — Library.** The existing `HistoryPanel` ("My generations") as a thumbnail column;
  click loads into the canvas. Publish stays accessible (panel or toolbar action).

Deep-link params accepted: `?prompt=`, `?mode=image&imageId=`, `?autostart=1`, plus the
existing `?model=<url>`. `autostart` triggers generation once on mount.

Migration note: `DEFAULT_MODEL_URL` (robotic hand) is no longer auto-loaded; it can remain
available as an explicit "load sample" affordance if desired, but the landing state is the
create surface.

---

## Community cards — Meshy-grade

Evolve `PostCard` within the new design system:
- Neon-edged card; large model preview (shaded → wireframe cross-fade on hover already
  exists).
- **Generation-type tag** (Text→3D / Image→3D) as a small neon pill.
- `@nick` with a tiny `Avatar` and ♥ likes + view count in the footer.
- Creator strips / achievement chips reuse the A8 Discover + A4 EmptyState patterns.

No backend needed; generation-type can be derived from post metadata already stored (or
defaulted). Achievement data is a **future** Track B ask (B11), not a blocker.

---

## Build sequence (phases → each becomes a plan step)

1. **Phase 1 — Neon Noir design system.** Remap tokens + add glow/scanline/neon-edge rules
   in `index.css`. Visual QA every page; no functional change.
2. **Phase 2 — Homepage generator console** + gallery; wire the navigate-and-autostart
   handoff (add param handling stub in Forge).
3. **Phase 3 — Forge 3-zone rework** + create-first empty state + autostart consumption +
   topology badge; spatial edit demoted to a mode.
4. **Phase 4 — Community card polish** to Meshy-grade.

Each phase: branch → `npm --prefix server test` + `npm --prefix client run build` → visual
QA (Playwright screenshots) → PR with `@claude review this PR against CLAUDE.md` →
squash-merge. Phases are independently shippable and ordered so Phase 1 unblocks the look
of 2–4.

## Track B (Javid) — future / optional, NOT blockers

- Topology stats (faces/vertices) on generated models → richer canvas badge.
- Achievements/badges data (B11) → real achievement chips.
- "My generations" as a first-class list (B8) if history isn't enough.

These are enhancements; phases 1–4 ship without them in mock mode.
