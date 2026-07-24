// Parse a free-text recolor instruction into something the viewer can apply
// LOCALLY (instant, free, shape untouched). Two modes:
//   single — "matte black" / "glossy red"           → tint the whole model
//   swap   — "white to black, blue to red"           → remap ONLY those colours
// Swap is the "change this colour to that, leave the rest" the user wanted, and
// works per-texel on the texture so a white-with-blue-lines robot becomes
// black-with-red-lines without touching anything else.

const COLORS = {
  black: '#2a2a2d',
  charcoal: '#3c4650',
  white: '#f2f2f0',
  gray: '#808080',
  grey: '#808080',
  silver: '#c8ccd0',
  red: '#c0392b',
  crimson: '#a01722',
  maroon: '#5e1914',
  orange: '#e67e22',
  amber: '#f0a020',
  yellow: '#f1c40f',
  gold: '#d4af37',
  green: '#2ecc55',
  emerald: '#1f9e5a',
  lime: '#9dff4d',
  teal: '#14b8a6',
  cyan: '#22d3ee',
  blue: '#2b6cff',
  navy: '#1a2a6c',
  purple: '#8e44ad',
  violet: '#7a4dd0',
  magenta: '#ff2d9b',
  pink: '#ff6fb5',
  brown: '#7b4b2a',
  bronze: '#cd7f32',
  copper: '#b87333',
}

const FINISHES = {
  matte: 'matte',
  flat: 'matte',
  glossy: 'glossy',
  gloss: 'glossy',
  shiny: 'glossy',
  polished: 'glossy',
  metallic: 'metal',
  metal: 'metal',
  chrome: 'metal',
  steel: 'metal',
}

const COLOR_WORDS = Object.keys(COLORS).join('|')
const FINISH_WORDS = Object.keys(FINISHES).join('|')
const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase())

// "<color> to|->|into [finish] <color>" — the swap phrasing, possibly several
const SWAP_RE = new RegExp(
  `\\b(${COLOR_WORDS})\\b\\s*(?:->|→|to|into)\\s*(?:(${FINISH_WORDS})\\s+)?\\b(${COLOR_WORDS})\\b`,
  'gi',
)

/**
 * @returns {null
 *  | { mode:'single', hex:string, finish:string|null, colorWord:string, label:string }
 *  | { mode:'swap', swaps:{from:string,to:string,finish:string|null,fromWord:string,toWord:string}[], label:string }}
 */
export function parseRecolor(prompt) {
  const text = String(prompt || '').toLowerCase()

  // 1) swap syntax wins if present ("white to black", "blue to red")
  const swaps = []
  let m
  SWAP_RE.lastIndex = 0
  while ((m = SWAP_RE.exec(text))) {
    const [, from, finishWord, to] = m
    if (from === to) continue
    swaps.push({
      from: COLORS[from],
      to: COLORS[to],
      finish: finishWord ? FINISHES[finishWord] : null,
      fromWord: from,
      toWord: to,
    })
  }
  if (swaps.length) {
    return { mode: 'swap', swaps, label: swaps.map((s) => `${cap(s.fromWord)}→${cap(s.toWord)}`).join(', ') }
  }

  // 2) single colour (earliest colour word wins) + optional finish
  let best = null
  for (const word of Object.keys(COLORS)) {
    const idx = text.search(new RegExp(`\\b${word}\\b`))
    if (idx !== -1 && (best === null || idx < best.idx)) best = { idx, word }
  }
  if (!best) return null

  let finish = null
  let finishAt = Infinity
  for (const word of Object.keys(FINISHES)) {
    const idx = text.search(new RegExp(`\\b${word}\\b`))
    if (idx !== -1 && idx < finishAt) {
      finishAt = idx
      finish = FINISHES[word]
    }
  }
  const colorWord = best.word
  const label = cap(`${finish ? `${finish} ` : ''}${colorWord}`)
  return { mode: 'single', hex: COLORS[colorWord], finish, colorWord, label }
}
