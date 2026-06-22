import mongoose from 'mongoose'

// One like by one user on one post.
const likeSchema = new mongoose.Schema(
  {
    postId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
  },
  { timestamps: true },
)

likeSchema.index({ postId: 1, userId: 1 }, { unique: true })

export default mongoose.model('Like', likeSchema)
