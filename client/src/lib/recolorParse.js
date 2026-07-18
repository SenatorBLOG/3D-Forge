// Parse a free-text recolor instruction ("matte charcoal black body", "make it
// glossy red") into a concrete colour + surface finish the viewer can apply
// LOCALLY — instant, free, shape untouched. This replaces the paid Tripo
// texture_model path, which (verified live) ignores the colour prompt and just
// reproduces the original texture. Returns null when no colour word is found.

// name → hex. Ordered loosely by how people phrase things; lookup is by word
// position in the prompt, so "charcoal black" picks charcoal (appears first).
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

// finish word → PBR feel. metal reads shiny + reflective; matte kills specular;
// glossy is a smooth non-metal sheen.
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

/**
 * @param {string} prompt
 * @returns {{ hex:string, finish:('matte'|'glossy'|'metal'|null), colorWord:string, label:string } | null}
 */
export function parseRecolor(prompt) {
  const text = String(prompt || '').toLowerCase()
  // pick the colour word that appears EARLIEST in the sentence (the primary one)
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
  const label = `${finish ? `${finish} ` : ''}${colorWord}`.replace(/^\w/, (c) => c.toUpperCase())
  return { hex: COLORS[colorWord], finish, colorWord, label }
}
