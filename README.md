# 3D Forge

**Generate, view, and locally edit AI-generated 3D models in the browser.**

CSIS 4495 group project — MJ Team: Mikhail Senatorov, Javid Aliyev.

The gap 3D Forge fills: text-to-3D tools (Meshy, Tripo) generate whole models, and
professional tools (Blender) require modeling skills. 3D Forge sits in between — open an
AI-generated model in the browser, **click the part you want to change**, describe the
change in plain language, and the system builds a *spatial prompt* (instruction + 3D
coordinates + region context) for the AI service to perform a localized edit.

## Features

- **Generate** a 3D model from a text prompt (Meshy AI text-to-3D), with live progress.
- **View** any GLB in the browser — generated, uploaded from disk, or loaded from a URL —
  with orbit controls and **click-to-select** a region (raycast; the picked sub-mesh is
  highlighted and its name + 3D coordinates become the edit target).
- **Edit** the selected region in plain language. The **Spatial Prompt Engine** combines
  the instruction with the click point, region, and base-model context into a structured
  prompt (optionally refined by the Claude API) and runs it through the generation
  pipeline; the result loads back into the viewer.
- **Version history** — every generation and edit is a browsable version; load any
  earlier one back into the viewer.
- **Research tooling** — run an edit in `spatial` mode (grounded) or `plain` mode (bare
  instruction) to compare the two; rate each result 1–5; export the whole collection as
  a JSON or CSV dataset.

Everything above works **without any API keys or database** — a built-in mock generator
simulates the Meshy lifecycle so the full pipeline is demoable for free.

## Quickstart

```bash
git clone https://github.com/SenatorBLOG/3D-Forge.git
cd 3D-Forge
npm run install:all
npm run dev   # no .env needed — mock mode works key-free out of the box
```

- Client: http://localhost:5173
- Server: http://localhost:3001/api/health

## Demo (mock mode — no keys needed)

1. **Generate** — in the Generate panel, type `a small dragon` → *Generate 3D model*.
   The button shows progress; the model loads in the viewer when it finishes.
2. **Select** — click a part of the model. The sub-mesh highlights; its region name and
   3D coordinates appear under *Spatial prompt*.
3. **Edit** — type `make this part bigger`, leave *Spatial grounding* on, → *Send edit*.
   The new version loads in. Toggle *Spatial grounding* off and send the same instruction
   to see the plain-prompt baseline for comparison.
4. **History & dataset** — the History panel lists every version (Load any of them),
   rate the edits 1–5, and use *Export JSON* / *Export CSV* to download the dataset.

## Going live (real services)

Copy `server/.env.example` to `server/.env` and fill in any subset:

| Variable | Effect when set |
|---|---|
| `MESHY_API_KEY` | real Meshy text-to-3D instead of the mock generator |
| `ANTHROPIC_API_KEY` | Claude refines spatial prompts (template is used otherwise); `CLAUDE_MODEL` overrides the model |
| `MONGODB_URI` | generations/edits/dataset persist to MongoDB and survive restarts |

Each is independent — set only what you have. Restart the server after editing `.env`.

## Tests & build

```bash
npm --prefix server test         # node --test: spatial-prompt budget + dataset CSV
npm --prefix client run build    # production build
```

## Repo layout

| Path | What lives there |
|---|---|
| `client/` | React + Vite + Three.js frontend |
| `server/` | Node + Express API, Spatial Prompt Engine, dataset export |
| `docs/ARCHITECTURE.md` | system architecture and data flow |
| `docs/WORKFLOW.md` | team workflow (branches, PRs, AI agents) |
| `docs/plans/` | backlog and per-milestone plans |
| `CLAUDE.md` | shared context for Claude Code (both teammates) |
| `.claude/agents/` | role subagents: architect, code-reviewer, qa-tester |

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | liveness |
| `POST` | `/api/generate` | start a text-to-3D task → `{ taskId, mock }` |
| `GET` | `/api/generate/:taskId` | poll status/progress/modelUrl |
| `POST` | `/api/edit` | spatial/plain edit → text-to-3D task |
| `GET` | `/api/history` | unified version list (DB or in-memory) |
| `GET` | `/api/dataset` | export edit dataset as JSON |
| `GET` | `/api/dataset/csv` | export edit dataset as CSV download |
| `PATCH` | `/api/dataset/:taskId` | set a 1–5 evaluation rating |

## Development workflow

This project is built with an agent-assisted workflow: each developer uses Claude Code
with shared role subagents (planning → implementation → review → QA), and a GitHub
`@claude` bot automatically reviews every pull request. Humans make the final call on
every merge — and review findings are treated as hypotheses to verify, not orders to
follow. Details: [docs/WORKFLOW.md](docs/WORKFLOW.md).
