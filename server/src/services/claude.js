import Anthropic from '@anthropic-ai/sdk'
import { MESHY_PROMPT_LIMIT } from './spatialPrompt.js'

// Optional refinement layer: Claude rewrites the structured spatial prompt
// into a tighter text-to-3D prompt. Without ANTHROPIC_API_KEY (or on any API
// error) the caller falls back to the deterministic template.

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8'

const SYSTEM_PROMPT =
  'You turn structured 3D-model editing requests into a single concise prompt ' +
  'for a text-to-3D generation service. The request JSON contains the base ' +
  'model description, a selected region of the mesh with its 3D coordinates, ' +
  'and the user\'s instruction for that region. Write one prompt (under ' +
  `${MESHY_PROMPT_LIMIT} characters, plain text, no quotes or preamble) that ` +
  'describes the whole model with the requested local change applied, keeping ' +
  'everything else of the base model intact.'

export const isClaudeEnabled = () => !!process.env.ANTHROPIC_API_KEY

// lazy singleton: constructing Anthropic() without an API key throws, and this
// module is imported even in keyless (mock) mode — so never construct at module
// scope; reuse one client across calls once the first refinement happens
let client = null

/**
 * Refine a spatial prompt via Claude; resolves to the prompt text.
 * Throws on API failure — the route decides to fall back to the template.
 */
export async function refinePrompt(spatialPrompt) {
  if (!client) {
    // construction succeeds even with a garbage key (failures surface on the
    // first request) — log it so a misconfigured key is visible in the logs
    console.log(`Claude refinement: creating client (model ${MODEL})`)
    client = new Anthropic()
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(spatialPrompt) }],
  })
  const text = response.content
    .find((block) => block.type === 'text')
    ?.text?.trim()
  if (!text) throw new Error('Claude returned no text content')
  return text.slice(0, MESHY_PROMPT_LIMIT)
}

const LABEL_SYSTEM =
  'You name the parts of a 3D model. You receive the object description and a list ' +
  'of parts (in order), each with a normalized 3D position and size inside the ' +
  "model's bounding box: x 0=one side…1=the other, y 0=bottom…1=top, z 0=back…1=front; " +
  'size is the part\'s fraction of the whole on each axis. Assign every part a short, ' +
  'human-readable anatomical or functional name from where it sits and what the object ' +
  'is (e.g. Head, Torso, Left Arm, Right Leg, Tail, Wheel, Roof, Handle). Left/Right is ' +
  'from the model\'s own orientation; if you can\'t tell a side, just use the plain name. ' +
  'Reply with ONLY a JSON array, one entry per input part IN THE SAME ORDER, each ' +
  '{"i": <0-based index>, "label": "<name>"} — no prose, no code fence.'

/**
 * Ask Claude to label geometric parts by their normalized spatial layout.
 * `parts` is an ordered array of { pos:{x,y,z}, size:{x,y,z}, current }.
 * Resolves to a map { [arrayIndex]: label }. Throws on API/parse failure so the
 * route can report it — there is no deterministic fallback for naming.
 */
export async function labelParts({ description = '', parts = [] }) {
  if (!parts.length) return {}
  if (!client) {
    console.log(`Claude part-labeling: creating client (model ${MODEL})`)
    client = new Anthropic()
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: LABEL_SYSTEM,
    messages: [
      { role: 'user', content: JSON.stringify({ object: description || 'unknown object', parts }) },
    ],
  })
  const raw = response.content.find((b) => b.type === 'text')?.text?.trim() || ''
  // tolerate a stray ```json fence even though we asked for none
  const json = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let arr
  try {
    arr = JSON.parse(json)
  } catch {
    throw new Error('Claude returned unparseable labels')
  }
  if (!Array.isArray(arr)) throw new Error('Claude returned no label array')
  const out = {}
  arr.forEach((item, k) => {
    const idx = typeof item?.i === 'number' ? item.i : k
    const label = typeof item?.label === 'string' ? item.label.trim().slice(0, 40) : ''
    if (label && idx >= 0 && idx < parts.length) out[idx] = label
  })
  return out
}
