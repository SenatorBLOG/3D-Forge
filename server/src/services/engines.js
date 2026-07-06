import { createPreviewTask, createImageTask, getTask, getMockTask, isMockMode } from './meshy.js'
import { createTripoTextTask, createTripoImageTask, getTripoTask, isTripoMock } from './tripo.js'

// Engine dispatcher: one place that knows which provider a task belongs to,
// so the routes stay engine-agnostic. Real Tripo ids are namespaced with a
// "tripo-" prefix; mock ids are shared ("mock-") and resolve directly.

export const ENGINES = ['meshy', 'tripo']

export const resolveEngine = (value) => (value === 'tripo' ? 'tripo' : 'meshy')

/** Whether the chosen engine runs for free (its key is absent → mock). */
export const engineIsMock = (engine) => (engine === 'tripo' ? isTripoMock() : isMockMode())

/** Start a generation on the chosen engine; returns our namespaced task id. */
export async function startGeneration({ engine, mode, prompt, imageInput, aiModel }) {
  if (engine === 'tripo') {
    const id =
      mode === 'image'
        ? await createTripoImageTask(imageInput?.bytes, imageInput?.mime)
        : await createTripoTextTask(prompt)
    // mock ids are pollable as-is; real Tripo ids get the namespace prefix
    return isTripoMock() ? id : `tripo-${id}`
  }
  return mode === 'image'
    ? createImageTask(imageInput?.dataUri ?? imageInput?.url, { aiModel })
    : createPreviewTask(prompt, aiModel)
}

/** Poll any task regardless of engine (unified Meshy-shaped result or null). */
export async function getAnyTask(taskId) {
  if (typeof taskId !== 'string') return null
  if (taskId.startsWith('tripo-')) {
    const task = await getTripoTask(taskId.slice('tripo-'.length))
    return task && { ...task, id: taskId } // keep our namespaced id in records
  }
  if (taskId.startsWith('mock-')) return getMockTask(taskId)
  return getTask(taskId)
}
