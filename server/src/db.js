import mongoose from 'mongoose'

/**
 * Connects to MongoDB if MONGODB_URI is set. The server intentionally runs
 * without a database for local development — stub routes still work.
 */
export async function connectDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.warn('MONGODB_URI not set — running without a database (stubs still work)')
    return
  }
  try {
    await mongoose.connect(uri)
    console.log('Connected to MongoDB')
  } catch (err) {
    console.warn(`MongoDB connection failed (${err.message}) — continuing without a database`)
  }
}

export const dbReady = () => mongoose.connection.readyState === 1
