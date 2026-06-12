import { Router } from 'express'
import { buildSpatialPrompt, renderPromptText, MESHY_PROMPT_LIMIT } from '../services/spatialPrompt.js'
import { refinePrompt, isClaudeEnabled } from '../services/claude.js'
import { createPreviewTask, isMockMode } from '../services/meshy.js'
import { dbReady } from '../db.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'

const router = Router()

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

// POST /api/edit — spatially-grounded edit: instruction + click point + region
// → spatial prompt → (optional Claude refinement) → text-to-3D task
router.post('/', async (req, res) => {
  const body = req.body ?? {}
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
  const { point, regionLabel, baseModel } = body

  if (!instruction) {
    return res.status(400).json({ error: 'instruction (non-empty string) is required' })
  }
  if (instruction.length > MESHY_PROMPT_LIMIT) {
    return res.status(400).json({ error: `instruction must be ${MESHY_PROMPT_LIMIT} characters or fewer` })
  }
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y) || !isFiniteNumber(point.z)) {
    return res.status(400).json({ error: 'point with finite numeric x, y, z is required' })
  }

  const spatialPrompt = buildSpatialPrompt({
    instruction,
    point,
    regionLabel: typeof regionLabel === 'string' ? regionLabel : null,
    baseModel: {
      prompt: typeof baseModel?.prompt === 'string' ? baseModel.prompt : null,
      modelUrl: typeof baseModel?.modelUrl === 'string' ? baseModel.modelUrl : null,
    },
  })

  // refinement is best-effort: a Claude failure must not block the edit
  let prompt = renderPromptText(spatialPrompt)
  let refinedBy = 'template'
  if (isClaudeEnabled()) {
    try {
      prompt = await refinePrompt(spatialPrompt)
      refinedBy = 'claude'
    } catch (err) {
      console.error('Claude refinement failed, using template:', err)
    }
  }

  let taskId
  try {
    taskId = await createPreviewTask(prompt)
  } catch (err) {
    console.error('edit generation failed:', err)
    return res.status(502).json({ error: 'Model generation service failed' })
  }

  if (dbReady()) {
    try {
      await SpatialPromptRecord.create({
        instruction,
        click: spatialPrompt.click,
        regionLabel: spatialPrompt.regionLabel,
        baseModel: spatialPrompt.baseModel,
        generatedPrompt: prompt,
        refinedBy,
        meshyTaskId: taskId,
        mock: isMockMode(),
      })
    } catch (err) {
      console.error('failed to persist spatial prompt record:', err)
    }
  }

  res.status(202).json({ taskId, mock: isMockMode(), prompt, refinedBy, spatialPrompt })
})

export default router
