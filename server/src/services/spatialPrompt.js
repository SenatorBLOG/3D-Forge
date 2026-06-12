// Spatial Prompt Engine — the core module of 3D Forge (docs/ARCHITECTURE.md):
// turns "what to change" (instruction) + "where" (click point, region) into a
// structured prompt the AI services can act on.

const MESHY_PROMPT_LIMIT = 600

/** Assemble the structured spatial prompt record. */
export function buildSpatialPrompt({ instruction, point, regionLabel, baseModel }) {
  return {
    version: 1,
    instruction,
    click: { x: point.x, y: point.y, z: point.z },
    regionLabel: regionLabel || 'unnamed region',
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
  const base = baseModel?.prompt ? `${baseModel.prompt}, ` : ''
  const text =
    `${base}modified so that the ${regionLabel} ` +
    `(near x=${click.x.toFixed(3)}, y=${click.y.toFixed(3)}, z=${click.z.toFixed(3)} in model space) ` +
    `is changed as follows: ${instruction}. Keep the rest of the model unchanged.`
  return text.length <= MESHY_PROMPT_LIMIT ? text : text.slice(0, MESHY_PROMPT_LIMIT)
}

export { MESHY_PROMPT_LIMIT }
