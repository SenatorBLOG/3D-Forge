// Real text→image via Google Gemini (https://ai.google.dev). Without
// GEMINI_API_KEY (or with GEMINI_API_KEY=mock) the routes fall back to the
// built-in SVG placeholder, so the whole pipeline still works key-free.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const apiKey = () => process.env.GEMINI_API_KEY
const model = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

export const isImageGenMock = () => !apiKey() || apiKey() === 'mock'

// --- quota guard: cap real image calls per day ----------------------------
// The Gemini free tier has a daily request budget; this keeps a runaway loop
// (or an enthusiastic demo) from burning it. In-memory: resets daily and on
// restart — same pragmatic pattern as MESHY_DAILY_LIMIT.
const dailyLimit = () => Number(process.env.IMAGE_DAILY_LIMIT || 40)
let limitDay = ''
let usedToday = 0

export function enforceImageDailyLimit() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== limitDay) {
    limitDay = today
    usedToday = 0
  }
  if (usedToday >= dailyLimit()) {
    const err = new Error(
      `Daily image-generation limit reached (${dailyLimit()}). ` +
        'Raise IMAGE_DAILY_LIMIT in server/.env or restart the server.',
    )
    err.code = 'DAILY_LIMIT'
    err.status = 429
    throw err
  }
  usedToday += 1
}

// --- Gemini call ------------------------------------------------------------

// `parts` is the Gemini content parts array (text and/or inline image data).
// Resolves to { bytes: Buffer, mime } of the first image in the response.
async function callGemini(parts) {
  const res = await fetch(`${BASE_URL}/${model()}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  const out = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)
  if (!out) {
    // e.g. safety block or text-only answer — surface it as a clean failure
    throw new Error('Gemini returned no image for this prompt')
  }
  return {
    bytes: Buffer.from(out.inlineData.data, 'base64'),
    mime: out.inlineData.mimeType || 'image/png',
  }
}

/** Generate an image from a text prompt. Returns { bytes, mime }. */
export async function generateImage(prompt) {
  enforceImageDailyLimit()
  return callGemini([{ text: prompt }])
}

/**
 * Edit an EXISTING image with a text instruction ("make the windows wider") —
 * the model receives the current image and changes only what's asked, which is
 * what makes the iterate-on-one-picture loop possible. Returns { bytes, mime }.
 */
export async function editImage(imageBytes, mime, instruction) {
  enforceImageDailyLimit()
  return callGemini([
    { inlineData: { mimeType: mime, data: Buffer.from(imageBytes).toString('base64') } },
    { text: instruction },
  ])
}
