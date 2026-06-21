import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDb } from './db.js'
import modelsRouter from './routes/models.js'
import generateRouter from './routes/generate.js'
import editRouter from './routes/edit.js'
import historyRouter from './routes/history.js'
import datasetRouter from './routes/dataset.js'
import authRouter from './routes/auth.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.use('/api/models', modelsRouter)
app.use('/api/generate', generateRouter)
app.use('/api/edit', editRouter)
app.use('/api/history', historyRouter)
app.use('/api/dataset', datasetRouter)
app.use('/api/auth', authRouter)

const port = process.env.PORT || 3001
await connectDb()
app.listen(port, () => {
  console.log(`3D Forge API listening on http://localhost:${port}`)
})
