# 3D Forge — Tasks

Living task list. **v1 shipped — now building v2: a community platform.**

## v2 — Community platform (in progress)

The pivot: from a solo tool into a social 3D platform — accounts, a gallery,
posts, profiles, and a polished multi-screen app. Ten directions:

- [x] **1. Accounts & auth** — register / login / JWT (bcrypt), in-memory + Mongo, `/api/auth/*`
- [x] **2. App shell & screens** — routing (Home / Forge / Login / Register), global top nav, landing page with an auto-rotating model showcase
- [x] **4. Publish to community** — publish the current model to a public gallery (title, model, author); login-gated `PublishPanel` on the Forge
- [x] **5. Explore feed** — `/explore` grid of everyone's published models, newest first; cards deep-link "Open in Forge"
- [x] **6. Likes** on posts — toggle, counts in feed + on the post page
- [x] **7. Comments** on posts — list + add (login-gated)
- [x] **8. Model showcase page** — `/post/:id` with a big auto-rotating viewer, like, comments, share link, Present (fullscreen)
- [x] **9. Profiles & avatars** — `/u/:username` page with an initial-avatar and the user's published models (this is the "my forge" gallery, #3)
- [x] **10. Animations & presentation mode** — fade transition between screens, cinematic auto-rotating showcase, Present fullscreen, shareable `/post/:id` links

**v2 roadmap complete — all 10 directions shipped.**

## Operational (when going live)
- [ ] Set `MESHY_API_KEY` + `MONGODB_URI` + `JWT_SECRET` in `server/.env`
- [ ] First real Meshy generation — manual check
- [ ] Course deliverables: final report + demo

## Done — v1 (proposal M0–M5 + frontend polish)
- [x] M0 team setup · M1 viewer + region select · M2 Meshy pipeline + mock mode
- [x] M3 Spatial Prompt Engine · M4 version history · M5 evaluation + dataset
- [x] UI #1 identity · #2 viewer env · #3 history cards · #4 progress/onboarding
- [x] UI #5 responsive sidebar · #6 chips/animations · #7 compare spatial vs plain
- [x] README, 2-page presentation PDF, `task.md`

## Notes
- Built **solo** by Mikhail Senatorov (`SenatorBLOG`) — every commit/PR is solo.
- Runs key-free in mock mode (incl. auth via in-memory store): `npm run install:all && npm run dev`.
- Checks: `npm --prefix client run build`, `npm --prefix server test`.
