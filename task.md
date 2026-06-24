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

## v2+ — Beyond the roadmap
- [x] **11. Tags & search** — tags on publish (normalized: lowercase, hyphenated, deduped, ≤6), `GET /api/posts/tags` popular-tag counts, `?tag=` / `?q=` feed filters, Explore search box + tag filter chips synced to the URL (shareable views), clickable tag chips on cards + post pages
- [x] **12. Notifications** — likes/comments on your post notify you (self-actions skipped); `Notification` model + service (in-memory + Mongo), `GET /api/notifications`(+`/count`), `POST /api/notifications/read`; TopNav bell with unread badge, polling, and a dropdown that marks all read on open
- [x] **13. Community on the landing page** — Home now shows a live gallery of everyone's published models (with likes, public/no-login), under the rotating-hand showcase; cards link to the post; "Explore all" → full searchable gallery
- [x] **14. Per-point prompts** — each clicked point carries its own prompt; numbered labels overlaid on the mesh (filled when a prompt is set), click a label → inline popup editor, mirrored in the Selected-points panel; the edit composes a region-annotated instruction (`<region>: <prompt>; …`) from every point
- [x] **15. Demo seed** — `services/seed.js` fills the gallery on boot (mock mode only, idempotent, non-fatal): 12 posts by 6 demo users with varied tags/likes/comments. Auto-discovers every `.glb` in `client/public/models/` — drop models in and they're used automatically (`SEED_DEMO=false` to disable)
- [x] **16. Edit/delete your own posts** — `PATCH`/`DELETE /api/posts/:id` (author-only, 403 otherwise); delete cascades to likes/comments/notifications; PostPage shows owner Edit (inline title/tags/description) + Delete (confirm) controls
- [ ] **17. Follow / Following** — follow users, Following feed, "started following you" notification
- [ ] **18. Model thumbnails on cards** — render each model once to an image, cache by URL, show on PostCard

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
