# 3D Forge — Tasks

Living task list: what's built and what's next. Updated as work lands.

## Done

### Product — proposal milestones (M0–M5)
- [x] **M0** — Team setup: repo, `CLAUDE.md`, role subagents, `@claude` PR-review bot, protected `main` (PR #1)
- [x] **M1** — 3D viewer: load GLB (generate / file / URL), multi-point region selection, remove & clear points (PR #2)
- [x] **M2** — Meshy text-to-3D pipeline + built-in **mock mode** (works with no keys / no credits) (PR #3)
- [x] **M3** — Spatial Prompt Engine: instruction + click coords + region → structured prompt, optional Claude refine (PR #4, fix #6)
- [x] **M4** — Version history: every generation/edit is a version, reload any into the viewer (PR #5)
- [x] **M5** — Evaluation + dataset: `spatial` vs `plain` modes, 1–5 rating, JSON/CSV export (PR #7)

### Frontend polish (UI roadmap)
- [x] **UI #1** — "Precision forge" visual identity: logo, typography, color system (PR #9)
- [x] **UI #2** — Viewer environment: 3-point lighting, ground grid, on-canvas toolbar; multi-point markers (PR #10)
- [x] **UI #3** — History as cards with badges + prominent ratings (PR #11)
- [x] **UI #4** — Task progress bars + first-run viewer hint (PR #13)
- [x] **UI #5** — Collapsible + responsive sidebar; `ResizeObserver` canvas sizing (PR #14)
- [x] **UI #6** — Quick-prompt chips + entrance / interaction polish (PR #15)
- [x] **UI #7** — Compare spatial vs plain side by side (PR #16)

### Docs
- [x] README: features, demo runbook, go-live, API reference (PR #8)
- [x] 2-page presentation PDF — `docs/presentation/`

## Next — frontend (backend untouched for now)
- [ ] Toast notifications for success / errors (replace inline error spans)
- [ ] Model stats panel: polygon count, mesh count, bounding size (read from the loaded GLB)
- [ ] Keyboard shortcuts (Ctrl/Cmd+Enter = generate / edit, Esc = clear points) + remember UI state in `localStorage`
- [ ] GLB version thumbnails in history (worthwhile once on real Meshy, not mock)

## Operational (when ready to go live)
- [ ] Set `MESHY_API_KEY` + `MONGODB_URI` in `server/.env` (switches mock → real)
- [ ] First real Meshy generation — manual visual check
- [ ] Course deliverables: final report + demo

## Notes
- Built solo by **Mikhail Senatorov** (`SenatorBLOG`). Partner inactive ~3 weeks — no commits; every commit/PR is solo.
- Runs key-free in mock mode: `npm run install:all && npm run dev`.
- Checks: `npm --prefix client run build`, `npm --prefix server test`.
