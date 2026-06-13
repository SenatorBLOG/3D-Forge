# M5 — Evaluation & dataset export

**Owner:** Mikhail (Javid inactive) · **Status:** done (PR #7) · **Branch:** `feat/m5-evaluation`

## Goal

Close the proposal's research loop. Each edit can run in one of two prompt
**modes** — `spatial` (instruction + click + region + base, the M3 engine) or
`plain` (the bare instruction, no spatial grounding) — so the team can compare
"selected region + instruction" against "a regular command without spatial
context". Every edit can be given an **evaluation** rating (1–5), and the whole
collection is exportable as an open **dataset** (JSON or CSV) — the research
output named in the proposal.

## API contract (server)

- `POST /api/edit` gains optional `mode` in the body: `"spatial"` (default) or
  `"plain"`. Plain mode sends the raw instruction as the prompt (`refinedBy:
  "none"`, no coords/region/base in the text) but still records the click and
  region, so a spatial/plain pair on the same instruction is comparable.
  Response gains `promptMode`.
- `GET /api/dataset` → `200 { records, source }` — every edit as a dataset row
  (instruction, click, regionLabel, promptMode, generatedPrompt, refinedBy,
  status, modelUrl, evaluation, mock, createdAt). `source` = `db | memory`.
- `GET /api/dataset/csv` → `200` text/csv attachment, same rows flattened.
- `PATCH /api/dataset/:taskId` body `{ evaluation: 1..5 | null }` → `200 { ok }`;
  400 on out-of-range; 404 when the task is unknown.

## Behavior

- `services/dataset.js` — shapes edit records into dataset rows (memory or DB)
  and serializes CSV (quoting per RFC 4180).
- `SpatialPromptRecord` gains `promptMode` (enum spatial|plain, default spatial)
  and `evaluation` (number 1–5, nullable).
- `services/history.js` — entries carry `promptMode`/`evaluation`;
  `updateEvaluation(taskId, value)` mutates the memory entry.
- Client: a "Spatial grounding" toggle in the edit panel (on = spatial,
  off = plain); a 1–5 rating control on succeeded edit entries in History; an
  "Export dataset" control (JSON + CSV).

## Acceptance criteria

1. `npm --prefix client run build` passes; `npm --prefix server test` passes
   (existing prompt-budget tests + new dataset/CSV tests).
2. No keys/DB: edit in `spatial` then `plain` mode on the same instruction →
   `GET /api/dataset` returns both rows with the right `promptMode`; the plain
   row's `generatedPrompt` equals the instruction and `refinedBy` is `"none"`.
3. `PATCH /api/dataset/:taskId {"evaluation":4}` → reflected in `GET /api/dataset`;
   `evaluation: 7` → 400; unknown task → 404.
4. `GET /api/dataset/csv` returns CSV with a header row and one row per edit,
   correctly quoting prompts that contain commas/quotes/newlines.
5. UI: grounding toggle, rating control, and export buttons work. (manual)

## Tasks

1. `server/src/models/SpatialPromptRecord.js` — add promptMode + evaluation.
2. `server/src/services/history.js` — carry promptMode/evaluation;
   updateEvaluation.
3. `server/src/services/dataset.js` — dataset rows (memory/DB) + CSV serializer.
4. `server/src/routes/edit.js` — mode handling (spatial|plain).
5. `server/src/routes/dataset.js` — GET json/csv + PATCH evaluation; mount.
6. `server/test/dataset.test.js` — CSV quoting + row shaping.
7. Client: grounding toggle (App), rating + export (HistoryPanel) + styles.
8. Docs: backlog, ARCHITECTURE status, README feature line.

## Out of scope

- Automated/LLM-judge scoring — evaluation is human-entered (a 1–5 rating). An
  automated judge could be a future extension but isn't needed for the report.
- True localized mesh diffing between spatial and plain outputs (visual compare
  is load-each-and-look via the existing History panel).

## Risks

- The comparison is only as good as the rater; the dataset captures the inputs
  and outputs so ratings can be revised later.
