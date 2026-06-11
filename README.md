# 3D Forge

**Generate, view, and locally edit AI-generated 3D models in the browser.**

CSIS 4495 group project — MJ Team: Mikhail Senatorov, Javid Aliyev.

The gap 3D Forge fills: text-to-3D tools (Meshy, Tripo) generate whole models, and
professional tools (Blender) require modeling skills. 3D Forge sits in between — open an
AI-generated model in the browser, **click the part you want to change**, describe the
change in plain language, and the system builds a *spatial prompt* (instruction + 3D
coordinates + region context) for the AI service to perform a localized edit.

## Quickstart

```bash
git clone https://github.com/SenatorBLOG/3D-Forge.git
cd 3D-Forge
npm run install:all
npm run dev
```

- Client: http://localhost:5173 (3D viewer — click the model to select a point)
- Server: http://localhost:3001/api/health

The server runs fine without a database; to enable MongoDB, copy `server/.env.example`
to `server/.env` and set `MONGODB_URI`.

## Repo layout

| Path | What lives there |
|---|---|
| `client/` | React + Vite + Three.js frontend |
| `server/` | Node + Express API, Spatial Prompt Engine |
| `docs/ARCHITECTURE.md` | system architecture and data flow |
| `docs/WORKFLOW.md` | team workflow (branches, PRs, AI agents) |
| `docs/plans/` | backlog and feature plans |
| `CLAUDE.md` | shared context for Claude Code (both teammates) |
| `.claude/agents/` | role subagents: architect, code-reviewer, qa-tester |

## Development workflow

This project is built with an agent-assisted workflow: each developer uses Claude Code
with shared role subagents (planning → implementation → review → QA), and a GitHub
`@claude` bot automatically reviews every pull request. Humans make the final call on
every merge. Details: [docs/WORKFLOW.md](docs/WORKFLOW.md).
