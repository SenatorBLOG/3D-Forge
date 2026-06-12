import mongoose from 'mongoose'

// One text-to-3D generation: the prompt, the upstream task, and its outcome.
// Spatial-prompt edit records (M3) will reference these documents.
const generatedModelSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    meshyTaskId: { type: String, required: true, index: true },
    status: { type: String, default: 'PENDING' },
    modelUrl: { type: String, default: null },
    mock: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export default mongoose.model('GeneratedModel', generatedModelSchema)
