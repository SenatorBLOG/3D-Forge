import { Router } from 'express'
import { buildSpatialPrompt, renderPromptText, MESHY_PROMPT_LIMIT, INSTRUCTION_LIMIT } from '../services/spatialPrompt.js'
import { refinePrompt, isClaudeEnabled } from '../services/claude.js'
import { createPreviewTask, isMockMode } from '../services/meshy.js'
import { dbReady } from '../db.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'
import { recordTask } from '../services/history.js'

const router = Router()

// |coordinate| cap keeps toFixed(3) strings short, so the rendered prompt's
// instruction-bearing core provably fits the 600-char Meshy limit; real
// raycast points are model-space values nowhere near this bound
const COORD_LIMIT = 1e6
const isValidCoord = (v) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= COORD_LIMIT

// POST /api/edit — edit the model from an instruction. mode "spatial" (default)
// grounds the prompt in the click point + region + base model (the M3 engine);
// mode "plain" sends the bare instruction (the comparison control for M5).
router.post('/', async (req, res) => {
  const body = req.body ?? {}
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
  const { point, regionLabel, baseModel } = body
  const promptMode = body.mode === 'plain' ? 'plain' : 'spatial'

  if (!instruction) {
    return res.status(400).json({ error: 'instruction (non-empty string) is required' })
  }
  if (instruction.length > INSTRUCTION_LIMIT) {
    return res.status(400).json({ error: `instruction must be ${INSTRUCTION_LIMIT} characters or fewer` })
  }
  if (!point || !isValidCoord(point.x) || !isValidCoord(point.y) || !isValidCoord(point.z)) {
    return res.status(400).json({
      error: `point with finite numeric x, y, z (each |value| <= ${COORD_LIMIT}) is required`,
    })
  }

  // blob: object URLs are client-local and meaningless in dataset records
  const rawModelUrl = typeof baseModel?.modelUrl === 'string' ? baseModel.modelUrl.slice(0, 2048) : null
  const modelUrl = rawModelUrl && /^(https?:\/\/|\/)/.test(rawModelUrl) ? rawModelUrl : null

  const spatialPrompt = buildSpatialPrompt({
    instruction,
    point,
    regionLabel: typeof regionLabel === 'string' ? regionLabel : null,
    baseModel: {
      prompt:
        typeof baseModel?.prompt === 'string'
          ? baseModel.prompt.slice(0, MESHY_PROMPT_LIMIT)
          : null,
      modelUrl,
    },
  })

  // plain mode is the control baseline: the raw instruction, no spatial context.
  // spatial mode renders the structured prompt and (best-effort) refines it —
  // a Claude failure must never block the edit.
  let prompt
  let refinedBy
  if (promptMode === 'plain') {
    prompt = instruction
    refinedBy = 'none'
  } else {
    prompt = renderPromptText(spatialPrompt)
    refinedBy = 'template'
    if (isClaudeEnabled()) {
      try {
        prompt = await refinePrompt(spatialPrompt)
        refinedBy = 'claude'
      } catch (err) {
        console.error('Claude refinement failed, using template:', err)
      }
    }
  }

  let taskId
  try {
    taskId = await createPreviewTask(prompt)
  } catch (err) {
    console.error('edit generation failed:', err)
    return res.status(502).json({ error: 'Model generation service failed' })
  }

  recordTask({
    kind: 'edit',
    taskId,
    prompt,
    instruction,
    regionLabel: spatialPrompt.regionLabel,
    click: spatialPrompt.click,
    promptMode,
    refinedBy,
    mock: isMockMode(),
  })

  if (dbReady()) {
    try {
      await SpatialPromptRecord.create({
        instruction,
        click: spatialPrompt.click,
        regionLabel: spatialPrompt.regionLabel,
        baseModel: spatialPrompt.baseModel,
        generatedPrompt: prompt,
        refinedBy,
        promptMode,
        meshyTaskId: taskId,
        mock: isMockMode(),
      })
    } catch (err) {
      console.error('failed to persist spatial prompt record:', err)
    }
  }

  res.status(202).json({ taskId, mock: isMockMode(), prompt, refinedBy, promptMode, spatialPrompt })
})

export default router
