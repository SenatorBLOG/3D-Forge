import mongoose from 'mongoose'

// One follow edge: followerId follows followingId.
const followSchema = new mongoose.Schema(
  {
    followerId: { type: String, required: true, index: true },
    followingId: { type: String, required: true, index: true },
  },
  { timestamps: true },
)

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true })

export default mongoose.model('Follow', followSchema)
