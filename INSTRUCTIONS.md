# 3D Forge — How to Run & Test

**3D Forge** is a web platform to generate, view, and locally edit AI-generated 3D models.
Team **MJ** — Mikhail Senatorov & Javid Aliyev (CSIS 4495).

Full architecture: `docs/ARCHITECTURE.md`. Team workflow: `docs/WORKFLOW.md`.

---

## Requirements
- Node.js 18+ and npm

## Setup & run
1. Install all dependencies:
   ```
   npm run install:all
   ```
2. Configure the server — copy the example env file:
   ```
   copy server/.env.example server/.env      (Windows)
   cp   server/.env.example server/.env       (macOS/Linux)
   ```
   Leave the API keys **blank** to run in **MOCK mode** — the full UI and workflow
   work with placeholder models and no external calls. To enable **real** AI
   generation, add your own **Tripo / Google Gemini / Meshy** API keys in `server/.env`.
3. Start the client and API server together:
   ```
   npm run dev
   ```
4. Open the app: **http://localhost:5173**  (the API server runs on http://localhost:3001)

> The app also runs without a database — it falls back to in-memory storage, so no
> MongoDB is required to try it out.

## Logging in
Registration is open — click **Sign Up** and create any username + password.
Or use a pre-seeded demo account:

| username | password        |
|----------|-----------------|
| `nova`   | `demo-password` |

## Compiled build
A production build of the client is included in **`client/dist/`**
(built with `npm --prefix client run build`). The recommended way to run the full
app (client + API together) is still `npm run dev`.

---

## Animation Sandbox (bonus feature)
A standalone page to **walk an animated character** around a small arena is served at:

**http://localhost:5173/robot-sandbox.html**

How to use:
1. In the app, add an animation to a model, then **download the `.glb`**.
2. **Drag that `.glb`** onto the sandbox page.
3. **TIP:** right after the model loads, press **`E`** once or twice so the character
   faces its walking direction (Tripo exports the mesh rotated 90°).

Controls: **WASD** move · **Shift** run · **C** crouch · **Space** jump ·
**right-click** attack · **Q / E** rotate model to align facing · **mouse drag** orbit camera.

---

## Tech stack
- `client/` — React + Vite + Three.js (3D viewer, raycast click-selection)
- `server/` — Node.js + Express (REST API, Spatial-Prompt engine, AI service calls)
- MongoDB (Atlas) via Mongoose; Cloudflare R2 for model/file storage
- AI services: Meshy & Tripo (3D generation), Google Gemini (images), Claude (prompt interpretation)
