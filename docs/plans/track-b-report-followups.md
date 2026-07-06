# Track B — Meshy-gap follow-ups (for Javid)

Two server-side tasks that unblock the last client items from the Meshy comparison
report. Track A (client) is done and waiting on these. **Scope: `server/src/**` only** —
do not touch `client/`. Every feature works in **mock mode + Mongo + file persistence**
and ships with a **node --test** test. Workflow: branch → `npm --prefix server test` +
`npm --prefix client run build` → PR → comment `@claude review this PR against CLAUDE.md`
→ squash-merge.

---

## B-R1 — `kind` on posts (generation-type badge)

**Status: ✅ done (Javid)** — model + service + route + seed + tests shipped; contract below is live.

**Why:** community cards want an "Image → 3D / Text → 3D" pill (Meshy shows this on every
card). The Post has no generation-type field, so A can't render it truthfully.

**Do:**
1. `server/src/models/Post.js` — add `kind: { type: String, enum: ['text', 'image'], default: null }`.
2. `server/src/services/posts.js` — `createPost(user, { title, modelUrl, description, tags, kind })`
   must accept and store `kind` (validate to `'text' | 'image'`, else `null`). Thread it
   through `base` → `publicPost` so it comes back in every post object (mock + Mongo paths).
3. `server/src/routes/posts.js` — `POST /api/posts` reads `req.body.kind`; keep it if it's
   `'text'` or `'image'`, otherwise store `null` (never 400 on a bad kind — just drop it).
4. `server/src/services/seed.js` — set a `kind` on each seeded post so the demo shows the
   badges (roughly split text/image across the 12 posts).

**Contract for A (client will wire this):**
- `POST /api/posts` now accepts optional `kind: 'text' | 'image'`.
- Every post object returned by `GET /api/posts`, `GET /api/posts/:id`, etc. now includes
  `kind: 'text' | 'image' | null`.

**Tests (`server/test/posts.test.js`):**
- creating a post with `kind: 'image'` → the returned post has `kind: 'image'`.
- creating with a bogus `kind: 'nope'` → `kind` is `null` (and status 201, not 400).
- a post created without `kind` → `kind` is `null`.

---

## B-R2 — model export/convert endpoint (download formats)

**Status: ✅ done (Javid)** — `GET /api/models/convert` live (GLB/OBJ/STL, local-only src guard);
built on `@gltf-transform/core` (Node-first — no DOM shims needed for textured GLBs).

**Why:** the download button only offers GLB. The report wants OBJ / STL (game/print
pipelines). FBX needs external tooling (Blender/Assimp) and is **out of scope** — do not
attempt it; the endpoint just won't list it.

**Do:** add a conversion endpoint (extend `server/src/routes/models.js` or a new
`convert.js` mounted under `/api/models`).

- `GET /api/models/convert?src=<path>&format=<glb|obj|stl>`
  - `src` must be a **local** model path (`/models/*.glb` served from
    `client/public/models`, or a stored upload under `.devdata/uploads`). **Reject anything
    else** (no remote URLs — SSRF guard). → `400` on a non-local or missing `src`.
  - `format=glb` → stream the original bytes.
  - `format=obj` / `format=stl` → parse the GLB and export. In Node you can
    `new GLTFLoader().parse(arrayBuffer, '', onLoad)` (works for binary GLB, no DOM), then
    run three's `OBJExporter` / `STLExporter` (`three/addons/exporters/…`) on the loaded
    scene. Return the text with the right `Content-Type` and a
    `Content-Disposition: attachment; filename="<name>.<ext>"`.
  - Unknown format → `400`.
  - Mock/real agnostic — this is pure file conversion, no keys, no DB.

**Contract for A:**
- Download offers **GLB / OBJ / STL**; each is a link to
  `/api/models/convert?src=<modelUrl>&format=<fmt>` that downloads the file.

**Tests (`server/test/convert.test.js`):**
- convert a bundled `/models/*.glb` to `obj` → body starts with `v ` vertices (contains
  `\nv ` and `\nf `).
- convert to `stl` → body starts with `solid`.
- `format=glb` → returns the original byte length.
- a non-local `src` (e.g. `http://evil/x.glb`) → `400`.

**Note:** three is already a dependency of the *client*, not the server. Add `three` to
`server/package.json` (it's pure-JS for loaders/exporters) — or, if you prefer no new
server dep, use `@gltf-transform/core` to read and hand-roll OBJ/STL from the geometry.
Pick one and note it in the PR.

---

## Guardrails (unchanged)
- Keep everything working **key-free in mock mode** (the class demo has no keys/DB).
- **No real payments**, no scraping third-party assets.
- Don't break existing tests; add tests for the new behaviour.
- Server files only — coordinate on the contracts above; A owns all of `client/`.
