import mongoose from 'mongoose'

// A registered account. Passwords are stored only as a bcrypt hash.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
)

export default mongoose.model('User', userSchema)
