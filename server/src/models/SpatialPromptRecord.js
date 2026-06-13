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
    refinedBy: { type: String, enum: ['claude', 'template', 'none'], required: true },
    promptMode: { type: String, enum: ['spatial', 'plain'], default: 'spatial' },
    evaluation: { type: Number, min: 1, max: 5, default: null },
    meshyTaskId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED'],
      default: 'PENDING',
    },
    modelUrl: { type: String, default: null },
    mock: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export default mongoose.model('SpatialPromptRecord', spatialPromptRecordSchema)
