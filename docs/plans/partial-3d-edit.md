# Partial 3D Editing — Plan

## Goal
Edit ONE region/part of a generated 3D model (add horns, change a helmet, recolor a crest)
without losing the rest — since no API does prompt-driven localized geometry editing
(verified July 2026; Hyper3D's localized edit is web-studio only, not API). We build it
ourselves with a **Gemini photo-edit loop → image-to-3D**, kept non-destructive by the 3D
version cards shipped in F0.

## Approach (decided with the user)
- **MVP = single rendered photo.** Render the current model to a photo → edit it with a text
  instruction via Gemini → show ONE variant with **re-roll / add-prompt** (same UX as photo
  generation) → image-to-3D → new 3D **version** (original kept).
- **The generator makes multi-view internally from one photo** — we do NOT ask Gemini for 3
  from-scratch views (those come out inconsistent).
- **Fidelity upgrade (P1.5):** edit 3 REAL screenshots (front/side/back), preserving the body,
  → multi-view image-to-3D → keeps the original body much closer. Body stays consistent (real
  photos lightly edited); only the small edited region may be slightly approximate.
- **Surface changes (emblem / color) skip regeneration** → retexture / in-browser paint; exact
  geometry preserved. Route by change type: surface = no regen; local shape = 1-view regen;
  big/global = 1-view regen or full redesign.

## Steps

### P1 — Single-photo partial edit (MVP) ← START HERE
- **P1a** Capture the current 3D model as an editable image: client renders the live model to
  PNG → `POST /api/images` (source `render`) → imageId. Reuses the viewer/thumbnailer + the
  existing upload endpoint.
- **P1b** "Edit as photo" panel in the Forge: show the captured image + an instruction box
  ("add horns to the head") → `POST /api/images/:id/edit` → show the edited variant. **Re-roll**
  (regenerate) + **add-prompt**, exactly like the photo loop. Reuses the Image Lab edit chain.
- **P1c** "Generate 3D from this" → image-to-3D → new 3D model **version** (reuses the F0
  version strip). Non-destructive: the original stays a version to click back to.
- **P1d** Polish: loading/cost states, "don't like it? regenerate / refine" UX, placement in
  the Spatial-edit area.

### P1.5 — Multi-view fidelity upgrade
- **P1.5a** Capture 3 views (front/side/back) via the thumbnailer's multi-angle renders.
- **P1.5b** Edit each view with the same labeled instruction (Gemini), preserving the body.
- **P1.5c** Multi-view image-to-3D (needs the fal engine, below) → model that preserves the
  original body far better than single-view.

### Engine — add fal.ai (cheap, pay-per-use, no subscription) — enables P1.5, P2
- **E1** Server: `falClient` service + add `fal` to the engine dispatcher (Rodin / Tripo /
  Hunyuan on fal). Needs the user's fal.ai API key.

### P2 — Surface edits without regeneration (emblem / color / decal)
- **P2a** Retexture: send current GLB + prompt to fal Meshy/Tripo retexture → recolored model,
  same geometry, zero drift.
- **P2b** (optional) In-browser decal/texture paint for tiny marks (star emblem) — no API.

### P3 — Real segmentation + part UI (Tripo native API)
- **P3a** Server: real semantic segmentation via Tripo — parts with IDs, replacing the
  geometric mock in `segment.js`.
- **P3b** Client: part buttons under the model; hover-a-part → highlight/shader change;
  "explode" view (parts fly apart, then reassemble).
- **P3c** Click a part/button → runs the P1 edit loop scoped to that part.

### P4 — Part-only stitch (true preservation, experimental "wow")
- Segment → isolate part → edit its photo → image-to-3D that part → stitch at the saved bbox +
  CSG weld (three-bvh-csg). Rest byte-identical; seams imperfect.

### P5 — Paint-for-3D manual editor
- Color brush, light deform/scale a region, delete a decal. Three.js, no API.

### P6 — Pre-built parts / kitbashing
- Library of horns/wings/tails → drag onto snap points. Reliable fallback.

## Costs & keys
- Gemini image edit ≈ cents; image-to-3D ≈ $0.1–0.4 on fal, or Meshy credits. Cheap per edit.
- Keys: Gemini (have), Meshy (have); **fal** for P1.5/P2/engine; **Tripo native** for P3
  segmentation + retexture.

## Status
- **F0** (brightness + 3D version cards) — done, PR #88.
- **P1 (a–d) + P1.5** — done, PR #89.
- **P2** (recolor/retexture, Tripo, mock-first) — done.
- **P3** (part buttons + hover-highlight + explode; Tripo segment written doc-based,
  UI runs on the geometric segmentation key-free) — done.
- **Next:** enable TRIPO_API_KEY → verify/adjust the doc-based Tripo schemas
  (multiview, texture_model, segmentation) on a real call. Then P4/P5/P6.
