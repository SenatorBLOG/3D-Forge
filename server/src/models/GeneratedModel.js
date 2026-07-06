import mongoose from 'mongoose'

// One text-to-3D generation: the prompt, the upstream task, and its outcome.
// Spatial-prompt edit records (M3) will reference these documents.
const generatedModelSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    meshyTaskId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED'],
      default: 'PENDING',
    },
    modelUrl: { type: String, default: null },
    mock: { type: Boolean, default: false },
    // who generated it (null for anonymous/mock sessions) — powers the library's owner=me
    ownerId: { type: String, default: null, index: true },
  },
  { timestamps: true },
)

export default mongoose.model('GeneratedModel', generatedModelSchema)
