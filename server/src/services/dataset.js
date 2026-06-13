import { dbReady } from '../db.js'
import { listMemory } from './history.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'

// The research dataset: every spatially-grounded (or plain-baseline) edit as a
// flat row, for the spatial-vs-plain comparison promised in the proposal.

const COLUMNS = [
  'taskId',
  'createdAt',
  'promptMode',
  'instruction',
  'regionLabel',
  'clickX',
  'clickY',
  'clickZ',
  'generatedPrompt',
  'refinedBy',
  'status',
  'modelUrl',
  'evaluation',
  'mock',
]

function fromMemory() {
  return listMemory()
    .filter((e) => e.kind === 'edit')
    .map((e) => ({
      taskId: e.taskId,
      createdAt: e.createdAt,
      promptMode: e.promptMode ?? 'spatial',
      instruction: e.instruction ?? '',
      regionLabel: e.regionLabel ?? '',
      clickX: e.click?.x ?? null,
      clickY: e.click?.y ?? null,
      clickZ: e.click?.z ?? null,
      generatedPrompt: e.prompt ?? '',
      refinedBy: e.refinedBy ?? '',
      status: e.status ?? 'PENDING',
      modelUrl: e.modelUrl ?? null,
      evaluation: e.evaluation ?? null,
      mock: e.mock ?? false,
    }))
}

async function fromDb() {
  const rows = await SpatialPromptRecord.find().sort({ createdAt: -1 }).lean()
  return rows.map((r) => ({
    taskId: r.meshyTaskId,
    createdAt: r.createdAt,
    promptMode: r.promptMode ?? 'spatial',
    instruction: r.instruction ?? '',
    regionLabel: r.regionLabel ?? '',
    clickX: r.click?.x ?? null,
    clickY: r.click?.y ?? null,
    clickZ: r.click?.z ?? null,
    generatedPrompt: r.generatedPrompt ?? '',
    refinedBy: r.refinedBy ?? '',
    status: r.status ?? 'PENDING',
    modelUrl: r.modelUrl ?? null,
    evaluation: r.evaluation ?? null,
    mock: r.mock ?? false,
  }))
}

/** Dataset rows + their source ("db" | "memory"). */
export async function listDataset() {
  if (dbReady()) return { records: await fromDb(), source: 'db' }
  return { records: fromMemory(), source: 'memory' }
}

const csvCell = (value) => {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // RFC 4180: quote when the value contains a comma, quote, or newline
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serialize dataset rows to CSV with a header line. */
export function toCsv(records) {
  const header = COLUMNS.join(',')
  const lines = records.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(','))
  return [header, ...lines].join('\n')
}

export { COLUMNS }
