// 3D-token pricing for generation. Tokens are simulated (see wallet.js): a tier
// costs more when it's prettier. Mock mode is always free — the class demo runs
// key-free and must never be gated. Real (keyed) generation is charged so the
// wallet/economy is exercised.

// Per preview tier. meshy-5 is the cheap/default tier, meshy-6 the prettier one.
export const TIER_COSTS = {
  'meshy-5': 10,
  'meshy-6': 30,
}

// Adding color/textures (the refine stage) on top of a preview.
export const REFINE_COST = 20

const DEFAULT_TIER = 'meshy-5'

/**
 * Token cost of a generation. Returns 0 in mock mode (free/unlimited). For real
 * mode: refine has a flat cost; a preview costs by tier (unknown tier → cheapest).
 */
export function generationCost({ kind = 'preview', aiModel = DEFAULT_TIER, mock = false } = {}) {
  if (mock) return 0
  if (kind === 'refine') return REFINE_COST
  return TIER_COSTS[aiModel] ?? TIER_COSTS[DEFAULT_TIER]
}

/** The public price list, for the UI to show "this costs N tokens" before generating. */
export function priceList() {
  return { tiers: { ...TIER_COSTS }, refine: REFINE_COST }
}
