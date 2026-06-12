// Spatial Prompt Engine — the core module of 3D Forge (docs/ARCHITECTURE.md):
// turns "what to change" (instruction) + "where" (click point, region) into a
// structured prompt the AI services can act on.

const MESHY_PROMPT_LIMIT = 600
// instruction + region label + template boilerplate must always fit the Meshy
// limit, so the instruction can never be truncated out of the rendered prompt
const INSTRUCTION_LIMIT = 300
const REGION_LABEL_LIMIT = 120

/** Assemble the structured spatial prompt record. */
export function buildSpatialPrompt({ instruction, point, regionLabel, baseModel }) {
  return {
    version: 1,
    instruction,
    click: { x: point.x, y: point.y, z: point.z },
    regionLabel: (regionLabel || 'unnamed region').slice(0, REGION_LABEL_LIMIT),
    baseModel: baseModel || null,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Deterministic text rendering of a spatial prompt — the baseline used when
 * Claude refinement is unavailable, and the M5 comparison control.
 */
export function renderPromptText(spatialPrompt) {
  const { instruction, regionLabel, click, baseModel } = spatialPrompt
  // the instruction-bearing core is never truncated (instruction ≤ 300 and
  // regionLabel ≤ 120 keep it under the limit by construction); the base
  // description gets whatever budget remains
  const core =
    `modified so that the ${regionLabel} ` +
    `(near x=${click.x.toFixed(3)}, y=${click.y.toFixed(3)}, z=${click.z.toFixed(3)} in model space) ` +
    `is changed as follows: ${instruction}. Keep the rest of the model unchanged.`
  let base = baseModel?.prompt ? `${baseModel.prompt}, ` : ''
  const budget = MESHY_PROMPT_LIMIT - core.length
  if (base.length > budget) {
    base = budget > 2 ? `${base.slice(0, budget - 2).trimEnd()}, ` : ''
  }
  return base + core
}

export { MESHY_PROMPT_LIMIT, INSTRUCTION_LIMIT }
