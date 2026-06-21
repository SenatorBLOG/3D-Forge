import mongoose from 'mongoose'

// A model published to the community gallery. Author is denormalized so the
// feed renders without a join.
const postSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, index: true },
    authorUsername: { type: String, required: true },
    title: { type: String, required: true },
    modelUrl: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
)

export default mongoose.model('Post', postSchema)
