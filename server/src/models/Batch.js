import mongoose from 'mongoose'

// One batch generation: a group of image→3D tasks polled together.
const batchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, default: null, index: true },
    tasks: {
      type: [{ taskId: String, imageId: String }],
      default: [],
    },
  },
  { timestamps: true },
)

export default mongoose.model('Batch', batchSchema)
