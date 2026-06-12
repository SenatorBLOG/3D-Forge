import { Router } from 'express'
import { dbReady } from '../db.js'
import { listMemory } from '../services/history.js'
import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'

const router = Router()

const MAX_ENTRIES = 50

// GET /api/history — generations and edits as a unified version list,
// newest first; persisted records when Mongo is up, session memory otherwise
router.get('/', async (req, res) => {
  if (!dbReady()) {
    return res.json({ entries: listMemory().slice(0, MAX_ENTRIES), source: 'memory' })
  }
  try {
    const [gens, edits] = await Promise.all([
      GeneratedModel.find().sort({ createdAt: -1 }).limit(MAX_ENTRIES).lean(),
      SpatialPromptRecord.find().sort({ createdAt: -1 }).limit(MAX_ENTRIES).lean(),
    ])
    const entries = [
      ...gens.map((g) => ({
        kind: 'generate',
        taskId: g.meshyTaskId,
        prompt: g.prompt,
        status: g.status,
        modelUrl: g.modelUrl,
        mock: g.mock,
        createdAt: g.createdAt,
      })),
      ...edits.map((e) => ({
        kind: 'edit',
        taskId: e.meshyTaskId,
        prompt: e.generatedPrompt,
        instruction: e.instruction,
        regionLabel: e.regionLabel,
        status: e.status,
        modelUrl: e.modelUrl,
        mock: e.mock,
        createdAt: e.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, MAX_ENTRIES)
    res.json({ entries, source: 'db' })
  } catch (err) {
    console.error('history list failed:', err)
    res.status(500).json({ error: 'Failed to list history' })
  }
})

export default router
