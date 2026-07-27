import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { dbReady } from '../db.js'
import ModelVersionTree from '../models/ModelVersionTree.js'

// Durable per-model version trees, keyed by (ownerId, rootModelUrl); also
// findable by ANY version's modelUrl so loading a child restores the whole strip.
//
// DUAL STORE: Mongo is the shared source of truth (so a teammate on the same
// MONGODB_URI sees the same version history). A local JSON mirror is kept as a
// fallback so a Mongo hiccup (e.g. the Atlas over-quota outage we hit) never
// loses an edit or breaks the request — writes land locally, reads fall back.

const FILE = fileURLToPath(new URL('../../.devdata/versionTrees.json', import.meta.url))
const TMP = `${FILE}.tmp`
const key = (ownerId, root) => `${ownerId ?? 'anon'}::${root}`
const mem = new Map()

try {
  const blob = JSON.parse(readFileSync(FILE, 'utf8'))
  if (Array.isArray(blob?.trees)) for (const t of blob.trees) mem.set(key(t.ownerId, t.rootModelUrl), t)
} catch {
  /* missing / bad file → start empty */
}

let timer = null
function persistLocal() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    try {
      mkdirSync(dirname(FILE), { recursive: true })
      writeFileSync(TMP, JSON.stringify({ trees: [...mem.values()] }))
      renameSync(TMP, FILE)
    } catch (err) {
      console.warn('versionTree local persist failed:', err.message)
    }
  }, 200)
  timer.unref?.()
}

const shape = (t) =>
  t && {
    rootModelUrl: t.rootModelUrl,
    versions: t.versions || [],
    currentVersionId: t.currentVersionId ?? null,
  }

const rootOf = (versions) =>
  (versions.find((v) => v.parentId == null) || versions[0])?.modelUrl || null

/** Find the tree (for this owner) that CONTAINS the given modelUrl. Mongo first
 * (shared), then the local mirror. */
export async function getTreeByModelUrl(ownerId, modelUrl) {
  if (!modelUrl) return null
  const owner = ownerId ?? null
  if (dbReady()) {
    try {
      const doc = await ModelVersionTree.findOne({
        ownerId: owner,
        $or: [{ rootModelUrl: modelUrl }, { 'versions.modelUrl': modelUrl }],
      }).lean()
      if (doc) return shape(doc)
    } catch (err) {
      console.warn('versionTree: DB read failed, using local:', err.code || err.message)
    }
  }
  for (const t of mem.values()) {
    if (t.ownerId !== owner) continue
    if (t.rootModelUrl === modelUrl || (t.versions || []).some((v) => v.modelUrl === modelUrl)) {
      return shape(t)
    }
  }
  return null
}

/** Upsert a tree (keyed by owner+root). Writes to Mongo (shared) AND the local
 * mirror; if the Mongo write fails, the local copy still keeps the edit. */
export async function saveTree(ownerId, { rootModelUrl, versions = [], currentVersionId = null }) {
  const root = rootModelUrl || rootOf(versions)
  if (!root || !versions.length) return null
  const owner = ownerId ?? null
  const t = { ownerId: owner, rootModelUrl: root, versions, currentVersionId }
  mem.set(key(owner, root), t)
  persistLocal()
  if (dbReady()) {
    try {
      const doc = await ModelVersionTree.findOneAndUpdate(
        { ownerId: owner, rootModelUrl: root },
        { $set: { versions, currentVersionId } },
        { new: true, upsert: true },
      ).lean()
      return shape(doc)
    } catch (err) {
      console.warn('versionTree: DB write failed, kept locally:', err.code || err.message)
    }
  }
  return shape(t)
}
