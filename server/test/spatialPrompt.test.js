import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSpatialPrompt,
  renderPromptText,
  MESHY_PROMPT_LIMIT,
  INSTRUCTION_LIMIT,
} from '../src/services/spatialPrompt.js'

// Locks in the prompt-budget guarantee: if the template wording ever grows,
// this fails instead of silently truncating the instruction in production.
test('worst-case rendered prompt fits the Meshy limit and keeps the instruction', () => {
  const instruction = 'i'.repeat(INSTRUCTION_LIMIT)
  const spatialPrompt = buildSpatialPrompt({
    instruction,
    point: { x: -1e6, y: -1e6, z: -1e6 }, // longest toFixed(3) strings allowed by the route
    regionLabel: 'r'.repeat(500), // capped to 120 inside buildSpatialPrompt
    baseModel: { prompt: 'b'.repeat(600), modelUrl: null },
  })
  const text = renderPromptText(spatialPrompt)
  assert.ok(
    text.length <= MESHY_PROMPT_LIMIT,
    `rendered length ${text.length} exceeds ${MESHY_PROMPT_LIMIT}`,
  )
  assert.ok(text.includes(instruction), 'instruction truncated out of the rendered prompt')
})

test('renders without a base model and keeps the instruction', () => {
  const spatialPrompt = buildSpatialPrompt({
    instruction: 'make this finger longer',
    point: { x: 0.12, y: 0.43, z: -0.07 },
    regionLabel: 'index finger',
    baseModel: null,
  })
  const text = renderPromptText(spatialPrompt)
  assert.ok(text.includes('make this finger longer'))
  assert.ok(text.includes('index finger'))
  assert.ok(text.length <= MESHY_PROMPT_LIMIT)
})
