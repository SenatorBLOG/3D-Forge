# Team Workflow — Mikhail & Javid

How two people (each with their own Claude Code subscription) work on this repo in
parallel without stepping on each other. Both Claudes read `CLAUDE.md` automatically,
so these rules are enforced on both sides.

## The golden rules

1. `main` is protected. Nobody commits to it directly — not you, not your Claude.
2. One task = one branch = one person. Branch names: `feat/<topic>`, `fix/<topic>`,
   `docs/<topic>`.
3. Everything merges through a PR.
4. The backlog lives in `docs/plans/`. Claim a task by putting your name in the
   **Owner** column *before* you start, and push that change to `main` via the same-day
   PR or directly note it in the team chat.

## Daily loop

```
git switch main
git pull origin main          # always start fresh
# look at docs/plans/ — pick an unclaimed task
git switch -c feat/<topic>
# ... work with Claude Code ...
# before opening the PR, run the code-reviewer subagent on your diff
git push -u origin feat/<topic>
gh pr create --fill
# @claude bot reviews automatically; your teammate approves; you merge
```

## Pull requests

- Keep PRs small — one task from the plan, not three.
- The `@claude` GitHub bot posts an automatic review on every PR (uses the
  `CLAUDE_CODE_OAUTH_TOKEN` secret).
- The other teammate must approve before merge (branch protection requires 1 review).
- Merge with **squash** to keep history readable.
- Delete the branch after merge.

## Talking to the bot

In any issue or PR, mention `@claude` in a comment:
- `@claude review this PR with extra attention to the raycasting logic`
- `@claude how does the spatial prompt get built?` (in an issue)
- `@claude fix the failing review comments` — it can push commits to the PR branch.

Bot usage burns the subscription quota of whoever's token is in the repo secret,
so don't spam it.

## Token discipline (subscriptions, not API)

- Each person's Claude Code runs on their own machine and their own quota.
- Subagents (`architect`, `code-reviewer`, `qa-tester`) are checkpoints, not autopilot:
  plan → build → review → verify. Don't run them on every tiny edit.
- Heavy parallel agent usage hits the 5-hour-window limit fast. If you hit the limit,
  the work continues fine without agents — they're an accelerator, not a dependency.

## Conflict avoidance

- Frontend and backend are split exactly so you rarely touch the same files.
- If a task spans both `client/` and `server/`, agree on the API contract first
  (write it into the plan file), then each person implements their side.
- If you do get a merge conflict: the person merging second resolves it; ask Claude
  to help (`git pull origin main` into your branch, resolve, re-push).
