# Initial Backlog

Milestones for 3D Forge. Claim a task by putting your name in **Owner** before starting
(see docs/WORKFLOW.md). When a milestone starts, run the `architect` subagent to expand
it into a detailed plan file in this folder.

| # | Milestone | Owner | Status |
|---|-----------|-------|--------|
| M0 | Team setup: repo structure, CLAUDE.md, subagents, @claude bot, client/server skeleton | Mikhail | ✅ done (PR #1) |
| M1 | Viewer: load a model from a URL / file upload, improve selection UX (highlight region, multiple markers) | Mikhail | ✅ done (PR #2) |
| M2 | Meshy AI integration: `POST /api/generate` → text-to-3D job → poll → save metadata in Mongo → show GLB in viewer | Mikhail (Javid inactive) | ✅ done (PR #3, [plan](2026-06-11-m2-meshy.md)) |
| M3 | Spatial Prompt Engine: combine instruction + click coords + region into a structured prompt; optional Claude API refinement; store spatial prompt records | TBD | ⬜ |
| M4 | Edit pipeline + version history: send spatial prompt for a localized edit, save model versions, version switcher UI | TBD | ⬜ |
| M5 | Evaluation + dataset: compare spatial vs plain prompts, export dataset records | TBD | ⬜ |

Suggested split (adjust as you like):
- **Mikhail** — frontend lead: M1, client side of M3/M4.
- **Javid** — backend lead: M2, server side of M3/M4.
- M5 together (it's the research/report part).

API contracts for cross-cutting milestones get written into the milestone's plan file
*before* implementation starts, so both sides can build in parallel.
