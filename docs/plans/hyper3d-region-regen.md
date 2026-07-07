# Hyper3D (Rodin) — region-targeted regeneration: feasibility

**Question (Mike):** can we send a Meshy model + our spatial points to Hyper3D and get back
the SAME model with only the pointed region changed (true local edit, not full regen)?

**Verdict: not directly with the public cloud API — but a real "part-swap" pipeline is
feasible.** Details below.

## What the public Rodin cloud API actually offers

- Generation only: text→3D / image→3D (Gen-1.5 / Gen-2 / Gen-2.5), quality tiers
  (4k–200k faces), PBR textures, GLB output.
- The only geometric "condition" is `bbox_condition` — a max-size box for a NEW generation.
  It does not take an existing mesh as an edit target.
- **No documented endpoint accepts an input mesh + region mask for partial regeneration.**
  The docs' own summary: a "regenerate only this region" workflow cannot be built on the
  current public API.
- **Rodin BANG!** — the interesting piece: takes a generated OR uploaded model and
  **segments it into parts** (separate meshes/materials), ~0.5 credits per run.
- The richer conditioning we'd want (`pcd_condition` point clouds, `voxel_condition`,
  `skeleton_condition` on the `rodin_mesh` endpoint) exists only in the **on-premises**
  (self-hosted enterprise) product — not accessible for a student project.

## Feasible pipeline for 3D Forge: "part swap"

Approximate a local edit without true region regen:

1. **Segment** — send the current GLB to Rodin **BANG!** → parts (arm, blade, wheel …).
2. **Locate** — our spatial points already carry 3D coords; hit-test them against part
   bounding boxes to pick the part(s) the user clicked. (We have `@gltf-transform/core`
   server-side from B-R2 — reading part bounds is easy.)
3. **Regenerate the part only** — text→3D (part prompt composed from the point prompts,
   e.g. "a longer index finger, same style") or image→3D of a render of that part.
4. **Reassemble** — replace the old part node with the new GLB (scale/position to the old
   part's bbox) via gltf-transform; return the merged GLB.

Result: the rest of the mesh is byte-identical, only the clicked region is new — which is
exactly the demo story ("Meshy can only re-roll the whole model; we swap the region you
pointed at").

**Caveats:** seams at the part boundary (no blending), style drift between old and new
parts, BANG! quality on organic meshes unknown, needs a paid Hyper3D key + per-op credits.
Good enough for a course demo; not production CAD.

## Suggested next steps (Track B)

- B-H1: `POST /api/edit/segment` — proxy to BANG!, cache part list per model.
- B-H2: part hit-test service (points → part id) using gltf-transform bounds.
- B-H3: `POST /api/edit/partswap` — orchestrate steps 2–4 (mock mode: swap the part with a
  primitive so the demo runs key-free).
- Client: reuse the existing spatial-point UI; add "Regenerate this part (Hyper3D)" beside
  "Send edit".

Sources: [Hyper3D API overview](https://developer.hyper3d.ai/api-specification/overview),
[full API doc dump](https://developer.hyper3d.ai/llms-full.txt),
[on-premises rodin_mesh](https://on-premises.docs.hyper3d.ai/mesh-generation/rodin-mesh),
[hyper3d.ai](https://hyper3d.ai/).
