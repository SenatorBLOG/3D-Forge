import mongoose from 'mongoose'

// One spatially-grounded edit — the dataset row promised in the proposal.
const spatialPromptRecordSchema = new mongoose.Schema(
  {
    instruction: { type: String, required: true },
    click: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      z: { type: Number, required: true },
    },
    regionLabel: { type: String, default: 'unnamed region' },
    baseModel: {
      prompt: { type: String, default: null },
      modelUrl: { type: String, default: null },
    },
    generatedPrompt: { type: String, required: true },
    refinedBy: { type: String, enum: ['claude', 'template'], required: true },
    meshyTaskId: { type: String, required: true, index: true },
    mock: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export default mongoose.model('SpatialPromptRecord', spatialPromptRecordSchema)
