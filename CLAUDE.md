# 3D Forge

Web platform for generating, viewing, and locally editing AI-generated 3D models.
CSIS 4495 group project — Mikhail Senatorov & Javid Aliyev (MJ Team).

Core idea: the user opens a model in the browser, clicks a region, types an instruction
("make this wing bigger"), and the system builds a **spatial prompt** — the text instruction
combined with 3D coordinates and region context — which is sent to AI services
(Meshy AI for 3D generation, Claude API for prompt interpretation).
Full architecture: `docs/ARCHITECTURE.md`.

## Stack

- `client/` — React + Vite + Three.js (plain JS, ESM). 3D viewer, raycast click selection.
- `server/` — Node.js + Express (ESM). API, Spatial Prompt Engine, AI service calls.
- MongoDB (Atlas) via Mongoose. Models stored and served as GLB/glTF.

## Commands

| Command | What it does |
|---|---|
| `npm run install:all` | install root + client + server dependencies |
| `npm run dev` | start client (http://localhost:5173) and server (:3001) together |
| `npm run dev:client` / `npm run dev:server` | start one side only |
| `npm --prefix client run build` | production build of the client |

Server env vars: copy `server/.env.example` to `server/.env` and fill in keys.
Never commit `.env` — it is gitignored for a reason.

## Team workflow (IMPORTANT — two people and two Claudes work in parallel)

Full rules live in `docs/WORKFLOW.md`. The short version you MUST follow:

1. **Never commit directly to `main`.** Always work on a branch: `feat/<topic>` or `fix/<topic>`.
2. **Before starting work:** `git pull origin main`, then check `docs/plans/` for the
   current backlog and task owners. Do not start a task someone else marked in-progress.
3. **One branch = one person** (plus their Claude). Never two people on the same branch.
4. **Merging goes through a PR.** The GitHub `@claude` bot reviews every PR automatically;
   the other teammate gives the human approval.
5. **Update `docs/plans/`** (task status, owner) in the same PR as the work itself.

## Conventions

- Plain JavaScript (no TypeScript), ESM (`import`/`export`) everywhere.
- React function components + hooks. One component per file in `client/src/components/`.
- Server: one router per resource in `server/src/routes/`, keep handlers thin.
- Three.js: keep all scene logic inside the viewer component; React state holds plain data
  (selected point, model URL) — never Three.js objects.
- Always dispose Three.js resources (geometries, materials, renderer) on unmount.
- Validate request bodies in Express routes before using them; return proper status codes.
- Commit messages: short imperative ("Add raycast picker"), reference the plan task if any.

## Subagents (`.claude/agents/`)

- `architect` — turns a feature idea into a plan file in `docs/plans/` before coding starts.
- `code-reviewer` — reviews the branch diff before you open a PR.
- `qa-tester` — builds and runs the app to verify acceptance criteria after implementation.

Use them at checkpoints (plan → build → review → verify), not for every small edit:
subscription rate limits burn fast when agents run in parallel.
