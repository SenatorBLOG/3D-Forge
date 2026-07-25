# Rigging & Animation — Plan (Task 6)

## Goal
Let the user put a **skeleton (rig)** on a generated 3D model inside 3D Forge, apply
ready-made **animations** (walk / run / jump / idle …), preview them in our viewer, and
**download the animated GLB** to use in an external game engine (Unity / Unreal / Godot /
Blender) — walk / crouch / run / jump like in Witcher or GTA.

NOT in scope (for now): an in-app 3D game sandbox. Our job ends at "download a rigged,
animated GLB".

## Key insight
Tripo (already integrated) does rigging + animation via the SAME task-chain pattern we
already use for segmentation and retexture: the model already lives in Tripo, we reference
it by `original_model_task_id` — no re-upload. We already have
`tripoTaskIdForModel(modelUrl)` (server/src/routes/regionEdit.js) that resolves a stored
model URL to its bare Tripo task id, so rigging works only on **Tripo-generated** models
(Meshy / uploaded models get a clear "generate in Tripo first" message — same limit as
segmentation).

## Tripo API (verified from docs, July 2026)
Task types (base URL `https://api.tripo3d.ai/v2/openapi`, chain by `original_model_task_id`):
- `animate_prerigcheck` — **Free**. Returns whether the model can be rigged (best for
  humanoid / biped shapes).
- `animate_rig` — **25 credits**. Produces a rigged model (skeleton), `out_format: 'glb'`.
- `animate_retarget` — **10 credits per animation**. Applies preset animation(s);
  `animation: 'preset:walk'` (or a list). Output = GLB with skeleton + animation clips.

Animation presets: idle, walk, run, jump, dive, climb, slash, shoot, hurt, fall, turn, plus
non-humanoid ones (quadruped_walk, hexapod_walk, serpentine_march, aquatic_march).

Pricing reference: **$1.00 = 100 credits**. So rig (25) + one animation (10) = **35 credits ≈ $0.35**.

### Verified live (2026-07-21) on robot `3db12cd8`
- prerigcheck → `{riggable:true, rig_type:'biped'}`, 0 credits (free).
- rig → `consumed_credit:25`; retarget walk → `consumed_credit:10` (balance 410→375).
- Output GLB inspected: 1 animation `preset:walk`, 1 skin, **41 bones**, 41 anim channels — real
  game-ready GLB (opens in Unity/Unreal/Godot/Blender).
- **retarget chains off the RIG task id** (not the base model): `original_model_task_id = <rig task_id>`.
- **Multiple animations in ONE GLB:** `animation` accepts a LIST
  `["preset:walk","preset:run","preset:jump"]` → one GLB with N clips (switch by name in-engine),
  10 credits per clip. Rig once; add clips anytime on the rigged model (no need to animate at creation).

## Steps

### Phase A — recon (no code)
- **6.0** Spike the live Tripo rig/animation chain on ONE existing Tripo model:
  prerigcheck (free) → rig (25) → retarget walk (10). Confirm task types, the exact preset
  strings, the output GLB has a skeleton + clips, and it opens in Blender. Cost ≈ 35 credits.
  ⚠️ Spends credits — ask the user before running. Keep TRIPO_DAILY_LIMIT=5.

### Phase B — server
- **6.1** Reuse `tripoTaskIdForModel()` to resolve model → Tripo task id (only Tripo models
  are riggable; others → 400 with a clear message). Add rig/animation task creators in
  `server/src/services/tripo.js` mirroring `createTripoSegmentByTaskId` (mock-safe when no key).
- **6.2** `POST /api/animate/rig { modelUrl }` — prerigcheck → if riggable, `animate_rig` →
  return the rigged model URL. If not riggable → 400 with reason.
- **6.3** `POST /api/animate/apply { modelUrl, preset }` — `animate_retarget` on the rigged
  model → return the animated GLB URL. One request = one animation.
- **6.4** Poll via the existing task flow; save the rigged / animated result as a **version**
  (not auto-added to Library), reusing the version-tree work.

### Phase C — client (FINAL UI, agreed 2026-07-21)
No two-step "add skeleton then animate" — too many buttons. Rigging is implicit inside Animate.

- **6.5 — ONE "🎬 Animate" button on the LEFT toolbar.** Acts on the currently-loaded model
  (current version). Non-Tripo / non-biped → disabled with a clear reason (prerigcheck is free
  and can gate this).
- **6.6 — Centered in-app MODAL** (not a browser popup, not a new window) over the model area.
  Default size: a centered dialog ~min(760px, 70vw) wide, covering part of the canvas, model
  still visible behind/around. Contents = a grid of ~10 animation CARDS (idle / walk / run /
  jump / dive / climb / turn / …). Multi-select; selected cards get a blue "selected" border.
  Cards already baked into THIS model are **greyed-out / non-clickable** ("already added").
  One live-priced button "Animate · N · N0 cr" (only NEW clips are counted).
- **6.6a — Implicit rig, charged once.** On Animate: if the model has NO skeleton yet, rig first
  (25 cr) then retarget the selected clips (10 each). If it ALREADY has a skeleton, skip the rig
  — detected **locally** (we store the rig task_id on the model's version node), NOT via an API
  call — so the 25 cr is never paid twice. So: 1st time 25 + N×10; later +10 per new clip only.
- **6.6b — Incremental clips merge client-side.** retarget off the same rig → each new clip is a
  GLB on the SAME skeleton (identical bone/node names), so we append its AnimationClip into the
  running multi-clip model client-side (GLTFLoader + rebind-by-name + GLTFExporter). This is why
  old clips are never re-charged. Save each result as a **version**.
- **6.7 — Bottom playback switcher** (not left/right bar): a small dropdown/strip at the
  BOTTOM-CENTER under the model (below the versions area). Pick a clip → Three.js `AnimationMixer`
  plays it live; switch → character swaps animation. Play/pause/loop.
- **6.8 — "⬇ Download animated GLB"** near the versions (bottom of the version strip): the
  rigged, multi-clip GLB for an external engine. Core deliverable.

Card-preview polish (agreed): each card shows a small looping gif; on HOVER show a LARGER
zoomed gif (to the side) so motion is actually visible (small cards don't show movement). The
2×–3× extra zoom is a later refinement.

### Phase D — later (non-blocking)
- **6.9** Non-humanoid / rig-check-fail handling: clear message + fallback (e.g. Mixamo as a
  manual path, or the quadruped presets).

## Order & value
6.0 (recon) → 6.2/6.3 (server) → 6.5–6.8 (UI). The highest-value slice is **6.2 + 6.5 (put
on a skeleton)** and **6.8 (download)** — enough to take a model out into an external engine
and walk / run / jump.

## Cost control
- Every rig/animation spends Tripo credits — ask before any live call, same as generation.
- prerigcheck is free → always run it first so we never waste 25 credits on an un-riggable model.
- Keep TRIPO_DAILY_LIMIT=5; the rig + animation calls go through the same daily guard.
