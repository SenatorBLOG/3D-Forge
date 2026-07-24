import { dbReady } from '../db.js'
import ModelVersionTree from '../models/ModelVersionTree.js'
import { load, flush } from './persistence.js'

// Durable per-model version trees (see the model file). Dual store like the rest
// of the project: Mongo when connected, an in-memory map (persisted to the dev
// file) otherwise. A tree is identified by (ownerId, rootModelUrl); we can also
// look one up by ANY version's modelUrl, so loading a child model still finds
// the whole strip it belongs to.

const key = (ownerId, root) => `${ownerId ?? 'anon'}::${root}`

const mem = new Map() // key -> { ownerId, rootModelUrl, versions, currentVersionId }
{
  const saved = load('versionTrees', null)
  if (saved?.trees) for (const t of saved.trees) mem.set(key(t.ownerId, t.rootModelUrl), t)
}
const saveMem = () => flush('versionTrees', { trees: [...mem.values()] })

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
  if (dbReady()) {
    const doc = await ModelVersionTree.findOne({
      ownerId: ownerId ?? null,
      $or: [{ rootModelUrl: modelUrl }, { 'versions.modelUrl': modelUrl }],
    }).lean()
    return shape(doc)
  }
  for (const t of mem.values()) {
    if (t.ownerId !== (ownerId ?? null)) continue
    if (t.rootModelUrl === modelUrl || (t.versions || []).some((v) => v.modelUrl === modelUrl)) {
      return shape(t)
    }
  }
  return null
}

/**
 * Upsert a tree: keyed by (ownerId, rootModelUrl). The client owns the version
 * ids/labels; we just persist the array + which node is current. rootModelUrl is
 * derived from the root node when not passed.
 */
export async function saveTree(ownerId, { rootModelUrl, versions = [], currentVersionId = null }) {
  const root = rootModelUrl || rootOf(versions)
  if (!root || !versions.length) return null
  const owner = ownerId ?? null
  if (dbReady()) {
    const doc = await ModelVersionTree.findOneAndUpdate(
      { ownerId: owner, rootModelUrl: root },
      { $set: { versions, currentVersionId } },
      { new: true, upsert: true },
    ).lean()
    return shape(doc)
  }
  const t = { ownerId: owner, rootModelUrl: root, versions, currentVersionId }
  mem.set(key(owner, root), t)
  saveMem()
  return shape(t)
}
