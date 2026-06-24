import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// Dev-only file persistence for the keyless/no-Mongo path. Snapshots the
// in-memory stores to a single JSON file so they survive `npm run dev` restarts.
// It NEVER touches the Mongo branch: when Mongo is connected, index.js calls
// setActive(false) and no file is written. Disabled entirely under tests.
//
// Each service stays generic to this module by passing plain JSON-serializable
// values (Map/Set are converted by the service's own serialize/deserialize).

const STORE_URL = new URL('../../.devdata/store.json', import.meta.url)
const STORE_PATH = fileURLToPath(STORE_URL)
const TMP_PATH = `${STORE_PATH}.tmp`
const VERSION = 1
const DEBOUNCE_MS = 250

// Disk I/O is off in tests (so the suite never creates/reads a file) and when
// explicitly opted out. `active` is flipped off once Mongo owns the data.
// `NODE_TEST_CONTEXT` is set by `node --test` in each test subprocess — the
// reliable, cross-platform signal that we're under the test runner.
const inTest = () =>
  process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT != null
const ioEnabled = () => !inTest() && process.env.DEV_PERSIST !== '0'
let active = true

let cache = {}
let warnedCreds = false

// Read the whole snapshot once, synchronously, at first import — before any
// service hydrates. Missing file or bad JSON falls back to empty stores (never
// crashes the boot).
if (ioEnabled()) {
  try {
    const blob = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
    if (blob && typeof blob === 'object' && blob.version === VERSION) {
      cache = blob.data || {}
    } else if (blob && 'version' in blob) {
      console.warn(`dev-persistence: store.json version mismatch — starting empty`)
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`dev-persistence: could not read store.json (${err.message}) — starting empty`)
    }
  }
}

let timer = null

function writeSync() {
  if (!ioEnabled() || !active) return
  if (!warnedCreds) {
    console.warn(
      'dev-persistence: writing local data to server/.devdata/ (gitignored). ' +
        'It holds dev credentials — do not commit or share it.',
    )
    warnedCreds = true
  }
  mkdirSync(dirname(STORE_PATH), { recursive: true })
  // Atomic write: full tmp file, then rename over the live file. A crash
  // mid-write can never corrupt store.json (rename is atomic on one volume).
  writeFileSync(TMP_PATH, JSON.stringify({ version: VERSION, data: cache }))
  renameSync(TMP_PATH, STORE_PATH)
}

/** Hydrate a store at module init: returns the persisted value or `fallback`. */
export function load(key, fallback) {
  if (!ioEnabled()) return fallback
  return key in cache ? cache[key] : fallback
}

/** Record a store's latest snapshot and schedule a debounced atomic write. */
export function flush(key, value) {
  cache[key] = value
  if (!ioEnabled() || !active) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    try {
      writeSync()
    } catch (err) {
      console.warn(`dev-persistence: write failed (${err.message})`)
    }
  }, DEBOUNCE_MS)
  timer.unref?.() // don't keep the event loop alive just for a pending flush
}

/** Synchronous flush for the process-exit path (the debounced write may be pending). */
export function flushSyncAll() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    writeSync()
  } catch (err) {
    console.warn(`dev-persistence: final flush failed (${err.message})`)
  }
}

/** Mongo owns the data → stop writing files. Called from index.js after connect. */
export function setActive(value) {
  active = value
}

/** Whether disk persistence is on at all (for modules without a dbReady() fork). */
export const isEnabled = ioEnabled

// Register exit hooks once. The signal handlers flush synchronously then exit,
// so beforeExit won't double-write (process.exit prevents it from firing).
if (ioEnabled()) {
  let exiting = false
  const onSignal = () => {
    if (exiting) return
    exiting = true
    flushSyncAll()
    process.exit(0)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  process.on('beforeExit', () => {
    if (!exiting) flushSyncAll()
  })
}
