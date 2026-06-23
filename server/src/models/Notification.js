import mongoose from 'mongoose'

// An activity notification for a post's author: someone liked or commented.
// Actor + post are denormalized so the bell renders without joins.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // recipient
    type: { type: String, required: true }, // 'like' | 'comment'
    actorId: { type: String, required: true },
    actorUsername: { type: String, required: true },
    postId: { type: String, required: true },
    postTitle: { type: String, default: '' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export default mongoose.model('Notification', notificationSchema)
