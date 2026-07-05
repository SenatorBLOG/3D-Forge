import mongoose from 'mongoose'

// One favorite edge: userId starred the library model taskId.
const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    taskId: { type: String, required: true, index: true },
  },
  { timestamps: true },
)

favoriteSchema.index({ userId: 1, taskId: 1 }, { unique: true })

export default mongoose.model('Favorite', favoriteSchema)
