# 3D Forge — v3 Roadmap (the "creation platform" month)

**Goal:** turn 3D Forge from "one hand + spatial prompting" into a **Meshy-inspired 3D
creation platform** that looks and feels premium: a real creation workspace, an
image → model → edit pipeline, a coins economy, rich profiles, and a beautiful
Discover/community experience.

This is a **4-week plan for two people working in parallel**. Track A is Mikhail,
Track B is Javid. The tracks are split by area so we almost never touch the same files.
**Don't re-plan — just execute and check boxes.** Adjust only at the weekly checkpoint.

> North star: a first-time visitor lands, sees gorgeous community models, thinks
> "I want to make one too," and can — image or text → 3D → edit by pointing.

---

## 0. How we work (READ FIRST — both of you)

### Ownership (so our agents never collide)
- **Track A — Mikhail → the client.** Owns `client/src/pages/**`, `client/src/components/**`,
  `client/src/index.css`, `client/public/**`, client hooks/UI. You build screens and design.
- **Track B — Javid → the server.** Owns `server/src/**` (models, services, routes, tests),
  the generation pipeline, the coins economy, search, and the public API. You build data + APIs.
- **Shared, edit tiny + additively only:** `client/src/App.jsx` (add a route),
  `server/src/index.js` (register a router). One line each, rarely — never refactor the other's area.
- **Contract-first:** before A builds UI for a B feature, B writes the endpoint shape in this
  doc (Request/Response JSON) so A can build against it with mock data in parallel.

### Definition of done (every task)
- Branch → implement → `npm --prefix server test` **and** `npm --prefix client run build` pass →
  PR → review → squash-merge. Keep it working **key-free in mock mode** (no keys/DB to demo).

### PR + @claude bot (the bot sometimes doesn't fire — this is the fix)
1. Push your feature branch, open the PR.
2. **Immediately post a PR comment: `@claude review this PR against CLAUDE.md`.**
   The auto-review often does NOT trigger on a collaborator's / forked branch — the `@claude`
   comment guarantees it runs every time. Don't rely on the automatic one.
3. Address the review, get a green check, then squash-merge and delete the branch.
4. Each PR title: `v3 <track><n>: <what>` e.g. `v3 B2: image→3D pipeline`.

### Guardrails (don't get us in trouble / keep it demoable)
- **Don't scrape or copy Meshy's models, images, or assets.** Fill our gallery with our own
  generated models, the existing GLBs, and CC-licensed/open assets only. Design is "inspired by"
  Meshy, rendered in **our** forge identity (amber + steel on dark).
- **Coins are simulated** — granted on signup, spent on generation. No real payments
  (a Stripe integration is an optional Week-4 stretch, clearly faked otherwise).
- Everything must still run with **no API keys** (mock mode) for the class demo.

### Weekly rhythm
- End of each week = a **tagged checkpoint** (`git tag v3-w1` …) + a 2-minute demo of that week's
  state. If a task slips, it rolls to the backlog — we do NOT stop to re-plan.

---

## 1. The big picture (what we're adapting from Meshy → 3D Forge)

| Meshy has | We build (our version) | Week | Owner |
|---|---|---|---|
| "What do you want to make today?" home, two entry modes | New **Create** landing: drop an image **or** describe it | 1 | A |
| Image-to-3D, Text-to-3D, Batch | Our **3-step pipeline**: Image → Model → Edit | 1–2 | B |
| 3-panel workspace (options / canvas / library) | **Workspace** redesign with our Forge | 2 | A+B |
| Topology stats, model tiers, license, pose | Model **metadata** + tier/license on each generation | 2 | B |
| Coins + Upgrade | **3D-tokens** wallet (simulated) + cost gating | 1, 4 | B+A |
| Discover by theme, creators, filters | **Discover** page: themes, filters, creator pages | 3 | A+B |
| Inspiration gallery, hover-reveal cards | **Beautiful gallery cards** (hover wireframe reveal) | 3 | A |
| Profile: creations, followers, achievements | **Rich profile**: creations, badges, stats, share | 3 | A+B |
| API + docs | **Public Spatial-Prompt API** (keys + docs) — our IP | 4 | B |

The **Spatial Prompt** (click a point, describe the change) stays our signature differentiator —
Meshy doesn't have it. Lead the demo and the API with it.

---

## 2. Track A — Mikhail (frontend / experience / community)

Your job: make the site **beautiful and addictive**. Keep the forge identity (Chakra Petch /
Hanken Grotesk / IBM Plex Mono, amber=action, steel=data, dark). Build against B's contracts with
mock data so you're never blocked.

### Week 1 — New shell & "Create" landing
- [ ] **A1. App shell refresh** — restructure nav: logo · Create · Discover · Community · API ·
      wallet/coins chip · avatar. Mobile-friendly.
- [ ] **A2. "Create" landing** — hero "What do you want to make today?" with **two entry cards**:
      *Drop an image* (upload/paste) and *Describe it* (prompt box). Themes row below
      (chips: Game, Anime, Castle, Dragon, Sci-fi…). Logged-out friendly.
- [ ] **A3. Wallet chip UI** — show 3D-token balance in the nav (reads `GET /api/wallet`,
      mock until B ships it). "Get tokens" opens a simple modal.
- [ ] **A4. Visual polish pass** — page transitions, button/hover states, empty states. No AI-slop;
      make it feel designed.

### Week 2 — Creation workspace
- [ ] **A5. 3-panel workspace** (replaces today's Forge layout):
      **left** = options (model tier M5/M6, type Standard/Low-poly, image-enhance toggle, pose,
      license); **center** = canvas + topology stats badge (faces/vertices) + toolbar
      (reset/rotate/export/present); **right** = "My generations" library grid.
- [ ] **A6. Generation flow UI** — prompt/image → progress with token cost + ETA → result lands in
      the library and on the canvas. Wire to B's unified pipeline.
- [ ] **A7. Library grid** — thumbnails (reuse our thumbnailer), filters (all / mine / favorites),
      reuse-prompt, load into canvas.

### Week 3 — Discover & gorgeous community
- [ ] **A8. Discover page** — theme tabs + filters (3D / Gaming / Collections / Creators),
      infinite grid of community models.
- [ ] **A9. Hover-reveal gallery card** — card shows rendered model; **on hover, cross-fade to a
      wireframe/orig view**, show likes ♥, favorite ★, and creator @nick. This is the "make it
      sexy" card — replace the plain HTML cards everywhere.
- [ ] **A10. Creator pages & rich profile** — avatar, banner, followers/following, tabs
      (Creations / Published / Favorites / Badges), edit profile, **Share profile** link.
- [ ] **A11. Badges/achievements UI** — render achievements as little 3D/medal tiles (reads B's stats).

### Week 4 — Account, monetization UI, polish, demo
- [ ] **A12. Account & settings** — profile settings, your tokens & spend history, your creations.
- [ ] **A13. Buy-tokens flow UI** — packages, confirm, balance updates (calls B's wallet grant; fake).
- [ ] **A14. Responsiveness + motion polish** — mobile layout, tasteful animations, final design QA
      with screenshots.
- [ ] **A15. Demo dressing** — make sure Discover/profiles look full and stunning for the demo.

---

## 3. Track B — Javid (backend / pipeline / API / monetization)  ← heavier load

Your job: build the **engine**. Every feature: in-memory mock + Mongo, file-persisted, tested.
Write each endpoint's contract in this doc the day before A needs it.

### Week 1 — Tokens economy + Image step backend
- [ ] **B1. 3D-token wallet** — `Wallet`/balance per user (mock + Mongo + persistence).
      `GET /api/wallet` → `{ balance, history }`; grant starter tokens on register; helper
      `spend(userId, amount, reason)`. **Contract for A3 due day 1.**
- [ ] **B2. Cost gating** — each generation tier has a cost (M5 cheap, M6 pretty); generation
      endpoints check + spend tokens (mock mode = free/unlimited, real = gated). Reuse the daily cap.
- [ ] **B3. Image step (the missing Step 1)** — `POST /api/images` to upload/accept a reference
      image (and a stubbed text→image generator in mock); store it; return an image id/URL the
      Model step can consume. Lays the groundwork for image→3D.
- [ ] **B4. Image→3D** — extend the generate pipeline to accept an image input (Meshy image-to-3D
      when keyed; mock returns a stub GLB). Contract: `POST /api/generate { mode:'image', imageId }`.

### Week 2 — Unified generation pipeline + model metadata
- [ ] **B5. Unified generate API** — one `POST /api/generate` taking `{ mode: 'text'|'image'|'batch',
      tier, options }` → task; the existing polling stays. Document Request/Response for A6.
- [ ] **B6. Batch image→3D** — accept multiple images → a queue of tasks; `GET /api/generate/batch/:id`
      for batch status.
- [ ] **B7. Model metadata** — store per generation: topology (faces/vertices if available), tier,
      license, source mode, prompt. Expose on the model/library objects (for A5/A7).
- [ ] **B8. Library API** — `GET /api/models?owner=me|all&filter=favorites&q=` with pagination.

### Week 3 — Search, themes, achievements
- [ ] **B9. Theme/tag taxonomy** — curated themes (game/anime/castle/dragon/sci-fi…) on posts;
      `GET /api/themes` + `?theme=` filtering on the feed.
- [ ] **B10. Search API** — `GET /api/search?q=` across titles/tags/creators (build on the tag work).
- [ ] **B11. Achievements & profile stats** — `GET /api/users/:username/stats`
      → `{ creations, published, followers, following, badges:[…] }`; award badges on milestones
      (first publish, 10 likes, etc.). Contract for A10/A11.
- [ ] **B12. Seed expansion** — grow the demo seed to many varied models/creators/themes (our own +
      CC assets only) so Discover looks alive. **No scraping.**

### Week 4 — Public Spatial-Prompt API + hardening
- [ ] **B13. Public API: Spatial Prompt** — `POST /api/v1/spatial-prompt` (our signature feature)
      taking `{ modelUrl, point, region, instruction }` → the structured/refined prompt + (optional)
      a generation task. API-key auth (`X-API-Key`), per-key rate limit.
- [ ] **B14. API keys** — issue/list/revoke keys per account (`/api/keys`), for the API nav page.
- [ ] **B15. API docs page data** — a simple machine-readable spec + examples (A renders the docs page,
      or ship a static docs route).
- [ ] **B16. Token grant/"buy" endpoint** — `POST /api/wallet/grant` (simulated purchase) for A13;
      harden, add tests, finalize.

---

## 4. Weekly checkpoints (shared — what "done" looks like)

- **Week 1 ✅** New home ("what to make today", 2 modes) + token balance in nav; you can upload an
  image and get a (mock) 3D model; tokens are spent on generation. → tag `v3-w1`.
- **Week 2 ✅** Full 3-panel workspace: text/image/batch generation, costs + ETA, topology stats,
  and a working "My generations" library. → tag `v3-w2`.
- **Week 3 ✅** Discover page with themes/filters, gorgeous hover-reveal cards, creator pages and
  rich profiles with badges; seeded gallery looks full. → tag `v3-w3`.
- **Week 4 ✅** Public Spatial-Prompt API with keys + docs, account/settings + token buy flow,
  responsive + polished. Monetization-ready, fully demoable in mock mode. → tag `v3-w4`.

Each checkpoint: push, tag, and record a 30-sec screen capture for the report.

---

## 5. Backlog / stretch (only if ahead)
- Remesh / retexture tools in the canvas toolbar.
- Real same-model editing (retexture for colour + local Three.js geometry edits) — the hard one.
- Multiple generator APIs side-by-side for comparison.
- Real Stripe payments (replace simulated tokens).
- Animate/rig and print-prep modes (Meshy's other tabs).

## 6. Out of scope (this month)
- Scraping/importing other platforms' models or assets (IP — not happening).
- Real-money billing beyond a simulated flow.
- Native mobile apps.

---

*Living doc. Check boxes as you go; revisit only at the weekly checkpoint. Older shipped work
(v1/v2 + #11–#18) is logged in `task.md`.*
