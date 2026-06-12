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

/**
 * Refine a spatial prompt via Claude; resolves to the prompt text.
 * Throws on API failure — the route decides to fall back to the template.
 */
export async function refinePrompt(spatialPrompt) {
  const client = new Anthropic()
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
