import mongoose from 'mongoose'

// A comment on a post. Author denormalized for display.
const commentSchema = new mongoose.Schema(
  {
    postId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    authorUsername: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true },
)

export default mongoose.model('Comment', commentSchema)
