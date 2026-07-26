import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// Durable per-model version trees. A tree is identified by (ownerId,
// rootModelUrl); we can also look one up by ANY version's modelUrl, so loading a
// child model still finds the whole strip it belongs to.
//
// LOCAL-FIRST (2026-07-25): version trees live in a dedicated on-disk file, NOT
// Mongo. Reason: with FILES_STORAGE=local the model bytes already live on this
// machine, and the shared Atlas is over-quota (writes blocked) — routing trees
// through it made writes fail while reads returned a STALE tree, so deleted
// versions "came back" after a reload. A plain local file is consistent and
// survives F5, model switches, and server restarts. (Cross-device sync returns
// with the Cloudflare-R2 storage move.)

const FILE = fileURLToPath(new URL('../../.devdata/versionTrees.json', import.meta.url))
const TMP = `${FILE}.tmp`

const key = (ownerId, root) => `${ownerId ?? 'anon'}::${root}`
const mem = new Map() // key -> { ownerId, rootModelUrl, versions, currentVersionId }

// hydrate once at import
try {
  const blob = JSON.parse(readFileSync(FILE, 'utf8'))
  if (Array.isArray(blob?.trees)) {
    for (const t of blob.trees) mem.set(key(t.ownerId, t.rootModelUrl), t)
  }
} catch {
  /* missing / bad file → start empty */
}

let timer = null
function persist() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    try {
      mkdirSync(dirname(FILE), { recursive: true })
      writeFileSync(TMP, JSON.stringify({ trees: [...mem.values()] }))
      renameSync(TMP, FILE)
    } catch (err) {
      console.warn('versionTree persist failed:', err.message)
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

/**
 * Find the tree (for this owner) that CONTAINS the given modelUrl — as its root
 * or any node — so loading any version reconstructs the full strip. Null if none.
 */
export async function getTreeByModelUrl(ownerId, modelUrl) {
  if (!modelUrl) return null
  const owner = ownerId ?? null
  for (const t of mem.values()) {
    if (t.ownerId !== owner) continue
    if (t.rootModelUrl === modelUrl || (t.versions || []).some((v) => v.modelUrl === modelUrl)) {
      return shape(t)
    }
  }
  return null
}

/**
 * Upsert a tree: keyed by (ownerId, rootModelUrl). The client owns the version
 * ids/labels; we just persist the array + which node is current. rootModelUrl is
 * derived from the root node when not passed. Writing REPLACES the stored
 * versions, so a delete on the client (fewer versions) sticks.
 */
export async function saveTree(ownerId, { rootModelUrl, versions = [], currentVersionId = null }) {
  const root = rootModelUrl || rootOf(versions)
  if (!root || !versions.length) return null
  const owner = ownerId ?? null
  const t = { ownerId: owner, rootModelUrl: root, versions, currentVersionId }
  mem.set(key(owner, root), t)
  persist()
  return shape(t)
}
