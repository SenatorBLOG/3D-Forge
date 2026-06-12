# M3 — Spatial Prompt Engine

**Owner:** Mikhail (Javid inactive) · **Status:** in progress · **Branch:** `feat/m3-spatial-prompt`

## Goal

The core idea of 3D Forge becomes real: a click on the model plus a text
instruction turns into a **structured spatial prompt** — instruction + 3D point +
region label + base-model context — which is (optionally) refined by the Claude API
into a single text-to-3D prompt and sent through the existing M2 generation
pipeline. Every edit is stored as a dataset record (the research output promised in
the proposal). The "Send edit" button in the sidebar finally works.

## API contract (server)

`POST /api/edit` body:

```json
{
  "instruction": "make this finger longer",
  "point": { "x": 0.12, "y": 0.43, "z": -0.07 },
  "regionLabel": "index finger",
  "baseModel": { "prompt": "a robotic hand", "modelUrl": "/models/robotic_hand.glb" }
}
```

→ `202 { taskId, mock, prompt, refinedBy, spatialPrompt }` where `prompt` is the
text actually sent to the generator and `refinedBy` is `"claude"` or `"template"`.
The client polls the existing `GET /api/generate/:taskId`.

- 400: missing/empty `instruction`; `point` missing or x/y/z not finite numbers;
  oversized instruction (> 600 chars)
- 502: upstream generation service failed (Claude refinement failure is NOT a 502 —
  it falls back to the template renderer)

## Engine behavior

1. `buildSpatialPrompt()` — assembles the structured record (version, instruction,
   click, regionLabel, baseModel, createdAt).
2. `renderPromptText()` — deterministic template: base description + "modified so
   that the <region> (near x,y,z) ... <instruction>", capped at Meshy's 600 chars.
3. With `ANTHROPIC_API_KEY` set: Claude (default `claude-opus-4-8`, override via
   `CLAUDE_MODEL`) rewrites the structured record into a tighter prompt; on any
   API error the template result is used — the edit never fails because of
   refinement.
4. Task goes to `createPreviewTask()` (M2 — real Meshy or mock).
5. `SpatialPromptRecord` persisted best-effort when Mongo is up: the full dataset
   row from the proposal (instruction, click, regionLabel, generatedPrompt,
   refinedBy, meshyTaskId, baseModel).

## Client

- `useGenerationTask` hook — the polling logic extracted from GeneratePanel
  (start(endpoint, body) → task/progress/error, resilient polling, single notify).
- GeneratePanel refactored onto the hook; reports the prompt that produced the
  model so App can track base-model context for edits.
- Spatial prompt panel: "Send edit" wired to `POST /api/edit`, live progress on the
  button, the prompt actually sent shown under it (demo/research visibility), new
  model loads into the viewer on success, instruction cleared.

## Acceptance criteria

1. `npm --prefix client run build` passes.
2. No keys at all (mock Meshy, no Claude): `POST /api/edit` with a valid body →
   202 with `refinedBy: "template"` and a prompt that contains the region label,
   coordinates, and instruction; polling reaches SUCCEEDED with a modelUrl.
3. Validation: missing instruction → 400; missing/NaN point → 400.
4. UI: select a region → type an instruction → Send edit → progress → viewer swaps
   to the result; the sent prompt is displayed. (manual)
5. With `ANTHROPIC_API_KEY`: same flow, `refinedBy: "claude"`, prompt ≤ 600 chars;
   a Claude API failure still completes the edit via the template. (manual, needs key)
6. Mongo up: each edit creates a SpatialPromptRecord. (manual, needs DB)

## Tasks

1. `server/src/services/spatialPrompt.js` — buildSpatialPrompt + renderPromptText.
2. `server/src/services/claude.js` — Anthropic SDK client, `refinePrompt()` with
   template fallback.
3. `server/src/models/SpatialPromptRecord.js` — mongoose schema (dataset row).
4. `server/src/routes/edit.js` + mount in `index.js`; validation per contract.
5. `client/src/hooks/useGenerationTask.js` — extract polling; refactor GeneratePanel.
6. `App.jsx` — base-model prompt tracking, edit submission, progress + sent-prompt
   display; styles.
7. `.env.example` — ANTHROPIC_API_KEY / CLAUDE_MODEL notes; ARCHITECTURE.md status.

## Out of scope (M4/M5)

- Version history and parent/child links between models (M4 — records already
  carry meshyTaskId + baseModel to enable it).
- Evaluation of edit quality and dataset export (M5).
- True localized mesh editing — Meshy regenerates a whole model from the enriched
  prompt; the spatial prompt record is what makes the comparison study (M5) possible.

## Risks

- Refinement quality is unevaluated until M5; the template path keeps results
  deterministic for the comparison baseline.
- Claude API cost: one short message per edit, capped output; model overridable via
  env to a cheaper one if quota matters.
