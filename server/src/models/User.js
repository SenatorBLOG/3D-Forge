import mongoose from 'mongoose'

// A registered account. Passwords are stored only as a bcrypt hash.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    bio: { type: String, default: '' },
    avatarColor: { type: String, default: null },
    bannerId: { type: Number, default: null },
  },
  { timestamps: true },
)

export default mongoose.model('User', userSchema)
