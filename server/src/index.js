import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDb, dbReady } from './db.js'
import { setActive } from './services/persistence.js'
import modelsRouter, { UPLOAD_DIR } from './routes/models.js'
import generateRouter from './routes/generate.js'
import editRouter from './routes/edit.js'
import historyRouter from './routes/history.js'
import datasetRouter from './routes/dataset.js'
import authRouter from './routes/auth.js'
import postsRouter from './routes/posts.js'
import notificationsRouter from './routes/notifications.js'
import usersRouter from './routes/users.js'
import walletRouter from './routes/wallet.js'
import imagesRouter, { IMAGE_DIR } from './routes/images.js'
import filesRouter from './routes/files.js'
import { seedDemoData } from './services/seed.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))
// serve user-uploaded models (saved by POST /api/models/upload)
app.use('/uploads', express.static(UPLOAD_DIR))
// serve reference images (saved by POST /api/images[/generate])
app.use('/images', express.static(IMAGE_DIR))
// cloud-stored files (GridFS) — images/models when Mongo is connected
app.use('/files', filesRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.use('/api/models', modelsRouter)
app.use('/api/generate', generateRouter)
app.use('/api/edit', editRouter)
app.use('/api/history', historyRouter)
app.use('/api/dataset', datasetRouter)
app.use('/api/auth', authRouter)
app.use('/api/posts', postsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/users', usersRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/images', imagesRouter)

const port = process.env.PORT || 3001
await connectDb()
// When Mongo owns the data, stop the dev file layer from writing snapshots.
if (dbReady()) setActive(false)
// Populate a demo gallery in mock mode (no-op under Mongo / when already seeded);
// never blocks boot if it fails.
await seedDemoData().catch((err) => console.error('demo seed failed:', err))
app.listen(port, () => {
  console.log(`3D Forge API listening on http://localhost:${port}`)
})
