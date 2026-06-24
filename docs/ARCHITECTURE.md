# 3D Forge — Architecture

Condensed from the project proposal (CSIS 4495). The proposal PDF is the source of
truth for scope; this file is the working reference for implementation.

## Layers

```
┌─────────────────────────────────────────────────────┐
│ client/  React + Vite + Three.js                    │
│   - 3D viewer (GLB/glTF, OrbitControls)             │
│   - Raycast click → selected point on the mesh      │
│   - Prompt form (instruction + selected region)     │
└──────────────────────┬──────────────────────────────┘
                       │ /api (Vite dev proxy → :3001)
┌──────────────────────┴──────────────────────────────┐
│ server/  Node + Express                             │
│   - routes: /api/health, /api/generate, /api/models │
│   - Spatial Prompt Engine (core module):            │
│     instruction + click coords + region + history   │
│     → structured spatial prompt                     │
└───────┬──────────────────────────────┬──────────────┘
        │                              │
┌───────┴───────────┐   ┌──────────────┴──────────────┐
│ AI services       │   │ MongoDB (Atlas, Mongoose)   │
│ - Meshy AI:       │   │ - model metadata + versions │
│   text-to-3D,     │   │ - spatial prompt records    │
│   model edits     │   │ - edit history / dataset    │
│ - Claude API:     │   └─────────────────────────────┘
│   instruction →   │
│   refined prompt  │
└───────────────────┘
```

## Data flow (happy path)

1. User enters an initial prompt ("a dragon") → `POST /api/generate`.
2. Server calls Meshy AI text-to-3D, stores model metadata in Mongo, returns the GLB URL.
3. Client displays the model in the Three.js viewer.
4. User clicks a point on the mesh (raycast) and types a local instruction
   ("make this wing bigger").
5. Server's Spatial Prompt Engine combines: instruction + click coordinates +
   approximate region + model context + edit history → structured spatial prompt
   (optionally refined via Claude API).
6. Spatial prompt goes to Meshy AI for a localized edit → new model version.
7. New version is saved (version history) and displayed; the whole interaction is
   stored as a dataset record.

## Spatial prompt record (Mongo document, draft)

```json
{
  "modelId": "…",
  "version": 3,
  "instruction": "make this finger longer",
  "click": { "x": 0.12, "y": 0.43, "z": -0.07 },
  "regionLabel": "index finger (approx)",
  "generatedPrompt": "…structured prompt sent to the AI service…",
  "outputModelUrl": "…GLB url…",
  "evaluation": null,
  "createdAt": "2026-06-10T00:00:00Z"
}
```

## Current implementation status

- ✅ Viewer skeleton: loads `client/public/models/robotic_hand.glb`, orbit controls,
  raycast click selection with a visual marker, coordinates shown in the sidebar.
- ✅ Server skeleton: `/api/health` live; Mongo connection optional (server runs
  without a DB for local dev). Without `MONGODB_URI`, the in-memory stores
  (accounts, posts, likes, comments, notifications, history) are snapshotted to a
  gitignored `server/.devdata/store.json` so they survive restarts; the file
  layer is disabled under tests and goes dormant once Mongo is connected
  (`DEV_PERSIST=0` opts out).
- ✅ Text-to-3D pipeline (M2): `POST /api/generate` → Meshy preview task →
  `GET /api/generate/:taskId` polling → generated GLB loads in the viewer.
  Built-in mock mode (no `MESHY_API_KEY`) simulates the lifecycle for free;
  generations persist to Mongo when a DB is connected (`GET /api/models`).
- ✅ Spatial Prompt Engine (M3): `POST /api/edit` builds a structured spatial
  prompt (instruction + click + region + base model), optionally refines it via
  the Claude API (template fallback), runs it through the generation pipeline,
  and stores a SpatialPromptRecord dataset row when Mongo is connected.
- ✅ Version history (M4): `GET /api/history` lists generations and edits as a
  unified version list (Mongo-backed when connected, in-memory per session
  otherwise); the History panel reloads any succeeded version into the viewer.
- ✅ Evaluation + dataset (M5): `/api/edit` runs in `spatial` (M3 engine) or
  `plain` (bare instruction) mode for the spatial-vs-plain comparison; edits
  carry a 1-5 `evaluation` rating (`PATCH /api/dataset/:taskId`); the full
  collection exports via `GET /api/dataset` (JSON) and `/api/dataset/csv`.
