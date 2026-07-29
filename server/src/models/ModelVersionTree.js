import mongoose from 'mongoose'

// A per-model VERSION TREE that outlives the browser session: every generate /
// edit / recolor / segment / part-edit / multiview appends a node here, so a
// user can build up 100 versions on one model, wander off to another model via
// the Library, come back, log out and back in — and the whole strip is still
// there. Distinct from GeneratedModel (the Library): a version only becomes a
// Library card when the user EXPLICITLY sends it there.
const nodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // client-assigned (v1, v2, …)
    parentId: { type: String, default: null }, // null = the root of the tree
    modelUrl: { type: String, required: true },
    label: { type: String, default: 'Version' },
    kind: { type: String, default: null }, // 'text' | 'image' | null
    // Task 6 — animation. A rigged/animated version carries its Tripo rig id, the
    // applied clip names, and the single-clip GLBs, so re-opening it can add more
    // clips for +10 (no re-rig) and the strip shows it as animated. These MUST be
    // on the schema — Mongoose silently drops fields it doesn't know, which is why
    // an animated version used to come back "un-animated" after a reload.
    rigTaskId: { type: String, default: null },
    clips: { type: [String], default: undefined },
    animEntries: {
      type: [new mongoose.Schema({ preset: String, url: String }, { _id: false })],
      default: undefined,
    },
  },
  { _id: false },
)

const treeSchema = new mongoose.Schema(
  {
    // owner scope: null for anonymous. A tree is keyed by (ownerId, rootModelUrl).
    ownerId: { type: String, default: null, index: true },
    // the modelUrl of the root version (parentId === null) — identifies the tree
    rootModelUrl: { type: String, required: true, index: true },
    versions: { type: [nodeSchema], default: [] },
    currentVersionId: { type: String, default: null },
  },
  { timestamps: true },
)

// one tree per (owner, root model)
treeSchema.index({ ownerId: 1, rootModelUrl: 1 }, { unique: true })

export default mongoose.model('ModelVersionTree', treeSchema)
