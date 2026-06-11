# Team Setup Design — approved 2026-06-10

Decision record for the M0 "team setup" milestone. Approved by Mikhail in conversation
with Claude Code on 2026-06-10.

## Problem

Two developers (Mikhail, Javid), each with their own Claude Code subscription, need to
work on 3D Forge simultaneously without conflicts, and the project proposal commits to
an agent-based development workflow.

## Decisions

1. **No custom orchestrator.** Building a coordinator/worker agent system via the API
   was rejected: high token cost, high complexity, distracts from the actual product.
   Instead we use Claude Code's built-in orchestration: role subagents + GitHub bot.
2. **Shared brain in the repo.** `CLAUDE.md` (conventions, commands, workflow rules) and
   `.claude/` (settings, subagents) are committed, so both developers' Claudes operate
   under identical rules.
3. **Role subagents** in `.claude/agents/`: `architect` (plan), `code-reviewer`
   (pre-PR review), `qa-tester` (verification). Used at checkpoints to conserve quota.
4. **GitHub `@claude` bot** via `anthropics/claude-code-action@v1` with a subscription
   OAuth token (`CLAUDE_CODE_OAUTH_TOKEN` secret): auto-review on PR open + mention
   handler in issues/PRs.
5. **Branch workflow.** Protected `main`, `feat/*` branches, one branch = one person,
   squash merges, backlog with owners in `docs/plans/`.
6. **Monorepo skeleton.** `client/` (React + Vite + Three.js viewer with raycast
   selection, loads the existing `robotic_hand.glb`) and `server/` (Express with
   `/api/health` + stubs, optional Mongo connection). Presentation assets moved to
   `docs/presentation/`.

## Resume framing

"Set up a role-based multi-agent development workflow (planning, code review, and QA
subagents) plus an autonomous CI review agent on GitHub for a two-developer team."
