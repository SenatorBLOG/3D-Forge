# Dev-mode file persistence (no MongoDB)

**Owner:** Javid · **Status:** implemented · **Branch:** `feat/dev-file-persistence`

## Goal

When the server runs without a MongoDB connection, the in-memory data stores
(accounts, posts, likes, comments, notifications, generation/edit history, and
spatial-prompt dataset rows) survive a server restart by being snapshotted to a
local JSON file and reloaded on startup. With `MONGODB_URI` set, behavior is
unchanged — Mongo remains the single source of truth and no file is touched.
The file is a local dev artifact (gitignored, never committed). This removes the
"everything resets on every `npm run dev`" pain that blocks keyless development
and demos.

## Background — what already exists (do not change the contracts)

- `server/src/db.js`: `connectDb()` connects only if `MONGODB_URI` is set;
  `dbReady()` returns true only when `mongoose.connection.readyState === 1`.
- Every service in `server/src/services/` has a `if (dbReady()) { Mongo } else
  { in-memory }` fork. The file layer is **only** about how the in-memory side is
  seeded at boot and flushed after mutations — it must not touch the Mongo branch
  and must not add a new fork.
- In-memory store shapes that must be persisted/restored:
  - `posts.js` — `memPosts: []` (array, newest first), `memSeq: number`.
  - `auth.js` — `memUsers: Map<username, user>`, `memSeq: number`. **Stores
    `passwordHash`** — login must keep working across restart, so the hash must be
    persisted (acceptable for a local dev file; see Risks).
  - `social.js` — `memLikes: Map<postId, Set<userId>>`,
    `memComments: Map<postId, []>`, `memCommentSeq: number`.
  - `notifications.js` — `memNotifs: []`, `memSeq: number`.
  - `history.js` — `memory: []` (note: **no `dbReady()` fork**; it exposes plain
    sync functions `recordTask`/`updateTask`/`updateEvaluation`/`listMemory`).
    `dataset.js` reads history via `listMemory()`, so persisting `history`'s
    `memory` array also covers the dataset's memory rows — no separate dataset
    store is needed.
- Tests in `server/test/` import services directly with no `MONGODB_URI`, so they
  exercise the in-memory path. They must not pick up or write a persistence file
  (see Acceptance criteria #5 and the `NODE_ENV=test` guard in Task 1).

## Design decisions

- **One file, not one-per-collection.** A single `server/.devdata/store.json`
  with a top-level key per store (`{ version, users, posts, likes, comments,
  commentSeq, notifications, history, seqs: {...} }`). One file = one atomic
  snapshot, simplest restore, no cross-file consistency to reason about. Volume is
  tiny (ring buffers cap at 100–500 entries). Path lives under `server/` so it is
  colocated with the process that owns it.
- **When to read:** once, synchronously, at module load of the persistence helper
  (before the services register their stores), so the snapshot is available the
  moment a service calls `register()`. Practically: services call
  `persist.load(key, defaultValue)` at module init to hydrate their store, and
  `persist.flush(key, snapshot)` after each mutation.
- **When to write:** **debounced async write** (e.g. 250 ms trailing) after any
  mutation, plus a **synchronous final flush on process exit**
  (`beforeExit` + `SIGINT`/`SIGTERM`). Debounce avoids rewriting the whole file on
  every like/comment in a burst; the exit flush guarantees the last change lands.
  Writes are **atomic**: write to `store.json.tmp` then `fs.rename` over
  `store.json` (rename is atomic on a single volume), so a crash mid-write can
  never corrupt the live file.
- **Enablement:** **on automatically whenever Mongo is not connected and not in
  test** — no flag required for the common case, because "persist when there's no
  DB" is exactly the desired default. Provide an **opt-out** env
  `DEV_PERSIST=0` and a hard disable when `NODE_ENV==='test'`. (Rationale for a
  flag at all: tests, and CI/throwaway containers that want a clean slate.)
  Document `DEV_PERSIST` in `server/.env.example`.
- **Serialization adapters:** the helper stores plain JSON, but two stores use
  `Map`/`Set`. Each service provides tiny `serialize`/`deserialize` adapters
  (e.g. `social.js` turns `Map<postId, Set>` into `{ postId: [userIds] }`), so the
  helper stays generic and never knows about domain shapes.

## Acceptance criteria (qa-tester runnable)

1. `npm --prefix client run build` passes (no client changes, sanity only).
2. `node --test server/test/` passes unchanged, and **no** `server/.devdata/`
   directory or file is created by the test run (test mode disables persistence).
3. No Mongo, fresh start: register a user, create a post, like it, comment, then
   stop the server (Ctrl-C) and start it again. After restart:
   `POST /api/auth/login` with the same credentials succeeds; `GET /api/posts`
   still lists the post; `GET /api/posts/:id` shows the like count and comment.
4. No Mongo, restart preserves notifications and history: a like/comment that
   produced a notification is still returned by `GET /api/notifications` after
   restart; `GET /api/history` and `GET /api/dataset` still return prior
   generations/edits after restart (`source: "memory"`).
5. Id continuity: after restart, creating a new post/comment/user produces an id
   strictly greater than any pre-restart id (seq counters restored, no collisions).
6. With `MONGODB_URI` set (manual, needs DB): no `server/.devdata/` file is
   written, and behavior is identical to today.
7. Corruption resilience: with the server stopped, replace `store.json` contents
   with `not json`; on next start the server logs a warning and boots with empty
   stores instead of crashing; a subsequent mutation rewrites a valid file.
8. `server/.devdata/` is gitignored — `git status` is clean after a dev session.

## Tasks

Each task is intended to be one commit.

1. **`server/src/services/persistence.js` (new) — the generic helper.**
   - Resolve the data dir/file with `node:path` relative to the module
     (`new URL('../../.devdata/store.json', import.meta.url)`), so cwd does not
     matter.
   - `isEnabled()` = `process.env.NODE_ENV !== 'test'` and
     `process.env.DEV_PERSIST !== '0'`. (Note: enablement also depends on "no
     Mongo", but the helper does not import `db.js` to avoid a load-order cycle —
     instead services only register/flush on the in-memory branch they already
     guard, so the Mongo branch never calls `flush`. The boot `load` is cheap and
     harmless even with Mongo, but guard it with `isEnabled()` to skip file I/O.)
   - Read the whole file **once** synchronously on first import (`readFileSync`),
     wrapped in try/catch → on missing file or `JSON.parse` failure, log a warning
     and fall back to `{}`. Hold the parsed blob in a module-level cache.
   - Export `load(key, fallback)` → returns `cache[key]` or `fallback`.
   - Export `flush(key, value)` → updates `cache[key]`, schedules the debounced
     atomic write (tmp file + `rename`). No-op when `!isEnabled()`.
   - Export `flushSyncAll()` for the exit path (synchronous tmp-write + rename).
   - Register exit hooks **once** here: `process.once('SIGINT'|'SIGTERM', …)`
     (flush then `process.exit`) and `process.on('beforeExit', …)`.
   - Files: new `server/src/services/persistence.js`. No deps but `node:fs`,
     `node:path`. Dependency: none — built first; all other service edits depend
     on it.

2. **Wire `auth.js`.** At module init: hydrate `memUsers`/`memSeq` from
   `load('users', …)` (rebuild the `Map` from a stored array, restore `memSeq`).
   After each mutation in `register()` (the only writer), call a local
   `save()` that serializes `Map → array` and calls
   `flush('users', { users, seq: memSeq })`. Depends on Task 1.

3. **Wire `posts.js`.** Hydrate `memPosts`/`memSeq` from `load('posts', …)`.
   `save()` after `memPosts.unshift(...)`/`pop()` in `createPost`, flushing
   `{ posts: memPosts, seq: memSeq }`. Depends on Task 1.

4. **Wire `social.js`.** Hydrate `memLikes` (`{postId: [userIds]} → Map<Set>`),
   `memComments` (`{postId: []} → Map`), `memCommentSeq`. `save()` after
   `toggleLike` and `addComment`. Note `likeInfo`/`listComments`/`commentCount`
   are read-only — no flush. Depends on Task 1.

5. **Wire `notifications.js`.** Hydrate `memNotifs`/`memSeq`. `save()` after
   `notify()` (insert) and after `markAllRead()` (mutates `read` flags in place).
   Depends on Task 1.

6. **Wire `history.js`.** Hydrate `memory` from `load('history', …)`. `save()`
   after `recordTask`, `updateTask`, `updateEvaluation`. This module has **no
   `dbReady()` fork**, so guard `save()`/`load` only with the helper's own
   `isEnabled()` — when Mongo is connected the routes simply don't read `memory`,
   so a persisted file is harmless but wastefully written; consider skipping the
   flush when Mongo is up by having the helper expose a settable
   `setActive(false)` toggled from `index.js` after a successful Mongo connect
   (see Task 7). `dataset.js` needs **no change** — it reads through
   `listMemory()`. Depends on Task 1.

7. **`server/src/index.js` — connect the Mongo signal + ensure exit flush.**
   After `await connectDb()`, if `dbReady()` is true call
   `persistence.setActive(false)` so no service flushes a file when Mongo owns the
   data (covers AC #6). Confirm exit hooks from Task 1 are registered (they are,
   on import). Depends on Tasks 1–6.

8. **`.gitignore` + `server/.env.example` + docs.** Add `server/.devdata/` (or
   `.devdata/`) to `.gitignore`; add `DEV_PERSIST` with a comment to
   `server/.env.example`; note the dev-persistence behavior in
   `docs/ARCHITECTURE.md` "Current implementation status" and flip this plan's
   Status. Depends on Tasks 1–7.

## Risks / open questions

- **Password hashes on disk.** The dev file stores bcrypt hashes for in-memory
  users. Acceptable for a local, gitignored dev artifact, but must be called out
  so nobody copies the file around or commits it. Mitigation: gitignore + a
  warning log on first write that `.devdata/` holds local credentials.
- **Schema drift.** The `version` field on the blob lets a future change detect
  an old file; for now, on a version mismatch just warn and start empty (same path
  as corruption). Decide whether even worth bumping vs. always-tolerant load.
- **Concurrent writers.** Single Node process, single-threaded — no real
  concurrency, but the debounce means rapid mutations coalesce into one write.
  The exit flush must be synchronous or the last debounced write can be lost on
  Ctrl-C; that's why `flushSyncAll()` exists. Confirm `beforeEbeforeExit` does not
  fire after an explicit `process.exit()` in the signal handler (so don't
  double-write — flush once in the signal handler, then exit).
- **`history.js` has no Mongo guard of its own.** It always uses `memory`. The
  `setActive(false)` toggle (Task 7) is the clean way to keep it from writing a
  file when Mongo is connected; if that feels heavy, an alternative is to leave
  history writing a (harmless, unused) file even with Mongo — but that violates
  the "no file when Mongo" acceptance criterion, so `setActive` is preferred.
- **Ring-buffer caps interact with restore.** Restoring an array that already sits
  at its `MAX` is fine (the next push trims). No special handling needed, just
  don't restore *more* than `MAX` — slice on load defensively.
- **Where exactly to put the file.** Proposed `server/.devdata/store.json`.
  Open question: some may prefer the repo root `.devdata/`. Pick one and gitignore
  the matching path; `server/` is recommended since the server process owns it.
- **No new dependencies** — confirmed achievable with `node:fs`/`node:path` only;
  atomicity via tmp-write + `rename`. No `proper-lockfile`/`lowdb` needed.

## Out of scope

- Any change to the Mongo branch or Mongoose models.
- Client changes (this is server-internal).
- Migration/sync between the file store and Mongo (one-way only: file is the
  fallback store, Mongo is independent).
