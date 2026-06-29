# 3D Forge — Midterm: Speaker Notes (5 slides, ~5 min + demo)

Open `3D-Forge-Midterm.html`, press **F11** (fullscreen), use **→ / ←** to move.
Plan: ~2 min on slides, then ~3 min live demo.

---

**1 · Title** (~20s)
"We're Mikhail and Javid. 3D Forge generates a 3D model from text, and lets you edit it by pointing at the part you want to change. Here's our midterm progress."

**2 · What we built — the 3-step tool** (~50s)
"The tool is three steps. **Image** — generate a reference image first; that's planned. **Model** — text-to-3D with Meshy, working today. **Edit** — click a point and describe the change with our spatial prompt; in progress.
Done so far: model generation, the spatial prompt, and a community app. Not yet: the image step and editing an existing model."

**3 · Tech & architecture** (~40s)
"Quick architecture: a React + Three.js browser, a Node + Express server, calling Meshy for 3D and Claude to refine prompts. It runs key-free in mock mode, so we can demo with no keys or database."

**4 · Challenges** (~40s)
"The hard parts: (1) spatial prompting — turning a click into a usable instruction. (2) The big one — **Meshy can't edit a mesh; it's text-to-3D only and ignores our 3D points**, so real editing needs another approach. (3) APIs and the browser — async generation, CORS, cost, voice — handled with a proxy, a cost cap, and mock mode."

**5 · What's next → DEMO** (~20s, then switch to the app)
"Next: the image step, real same-model editing, and going live. Now let's open it."

➡️ **LIVE DEMO (~3 min):**
- Gallery (real model thumbnails)
- Forge: generate → click a point → write a prompt → (voice if it works)
- A post: like / comment / follow
- Mention: all running in mock mode

---

*Demo backup:* if it breaks, talk through slides 2 & 4. To run locally: `npm run install:all` then `npm run dev` (works with no keys).
