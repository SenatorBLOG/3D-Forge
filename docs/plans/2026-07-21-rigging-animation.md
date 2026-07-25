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

### Phase C — client
- **6.5** "🦴 Add skeleton" button in the viewer tools. Shows prerigcheck result
  ("riggable" / "not a good fit"), then rigs. Disabled / explained for non-Tripo models.
- **6.6** Animation picker — dropdown of presets (walk / run / jump / idle …). Pick → apply.
- **6.7** Play the animation in the viewer with Three.js `AnimationMixer`: load the animated
  GLB, loop the clip in the render loop, play/pause + clip switch. (All Three.js scene logic
  stays inside ModelViewer.)
- **6.8** "⬇ Download animated GLB" — export/download the rigged+animated GLB so the user can
  open it in their own engine. This is the core deliverable.

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
