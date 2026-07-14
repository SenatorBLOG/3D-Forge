import { useEffect, useState } from 'react'
import { getThumbnail } from '../lib/thumbnailer.js'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

/**
 * Photo-based partial edit (plan: docs/plans/partial-3d-edit.md).
 * P1a — capture the loaded 3D model as an image (render → upload).
 * P1b — edit that photo with a prompt via Gemini (new version each time, branchable,
 *        re-roll / add-prompt like the photo loop). The original model is never lost.
 * P1c (next) — rebuild the chosen photo back into 3D.
 */
export default function PhotoEditPanel({ modelUrl, onModelReady3D }) {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState(null)
  // the edit-version family of the captured render (same shape as Image Lab)
  const [versions, setVersions] = useState([]) // [{ id, url, prompt, version, mime }]
  const [currentId, setCurrentId] = useState(null)
  const [stub, setStub] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState(null)
  const [lastEdit, setLastEdit] = useState(null) // { sourceId, instruction } for re-roll

  const currentImage = versions.find((v) => v.id === currentId) || null

  // each loaded model gets a fresh photo-edit session (incl. after a rebuild,
  // which swaps in the new model) — the old model's captured photos don't linger
  useEffect(() => {
    setVersions([])
    setCurrentId(null)
    setInstruction('')
    setStub(false)
    setLastEdit(null)
    setEditError(null)
    setError(null)
  }, [modelUrl])

  // P1c: rebuild the chosen photo into 3D. The result is handed up to the Forge,
  // which loads it as a NEW model version (a child of the current model) — the
  // original is kept, so a rebuild you dislike never loses it.
  const gen3d = useGenerationTask((url) =>
    onModelReady3D?.(url, currentImage?.prompt ? `Photo: ${currentImage.prompt}` : 'Photo edit'),
  )
  const rebuild3D = () => {
    if (!currentId || gen3d.generating) return
    gen3d.start(
      '/api/generate',
      { mode: 'image', imageId: currentId, model: 'meshy-5', engine: 'meshy' },
      { refine: false, model: 'meshy-5', prompt: 'photo edit' },
    )
  }

  const loadVersions = async (id) => {
    const res = await fetch(`/api/images/${encodeURIComponent(id)}/versions`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    setVersions(data.versions)
    setCurrentId(id)
  }

  const capture = async () => {
    if (!modelUrl || capturing) return
    setCapturing(true)
    setError(null)
    setEditError(null)
    setLastEdit(null)
    try {
      const { shaded } = await getThumbnail(modelUrl)
      if (!shaded) throw new Error('Could not render the model')
      const blob = await (await fetch(shaded)).blob()
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/png' },
        body: blob,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStub(false)
      await loadVersions(data.image.id) // starts a fresh edit family at V1
    } catch (e) {
      setError(e.message)
    } finally {
      setCapturing(false)
    }
  }

  // Apply an instruction to the CURRENT photo → a new version (edits branch off
  // whatever version is shown, so nothing is overwritten). Real Gemini when the
  // key is set; a labelled SVG stub otherwise, so the loop still demos key-free.
  const runEdit = async (sourceId, text) => {
    const instr = text.trim()
    if (!instr || !sourceId) return
    setEditing(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/images/${encodeURIComponent(sourceId)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStub(!!data.stub)
      setLastEdit({ sourceId, instruction: instr })
      await loadVersions(data.image.id)
    } catch (e) {
      setEditError(e.message)
    } finally {
      setEditing(false)
    }
  }

  const applyEdit = () => {
    runEdit(currentId, instruction)
    setInstruction('')
  }
  // re-roll: run the same last instruction on the same source again → a sibling variant
  const regenerate = () => lastEdit && runEdit(lastEdit.sourceId, lastEdit.instruction)

  const appendSpeech = (t) =>
    setInstruction((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))

  return (
    <section className="panel photo-edit">
      <div className="spatial-head">
        <span className="spatial-flag">✎ Photo edit</span>
        <h2>Edit as photo</h2>
      </div>
      <p className="spatial-blurb">
        Turn this model into a photo, change it with a prompt, then rebuild it in 3D — the
        original stays as a version, so an edit you dislike never loses it.
      </p>

      {versions.length === 0 ? (
        <button className="submit" onClick={capture} disabled={!modelUrl || capturing}>
          {capturing ? 'Capturing…' : '📷 Capture this model'}
        </button>
      ) : (
        <>
          <div className="image-lab">
            <div className="image-lab-main">
              <div className="image-drop has-image">
                <img
                  className="image-drop-preview"
                  src={currentImage?.url}
                  alt={currentImage?.prompt || 'model photo'}
                />
              </div>
              {stub && (
                <span className="hint">
                  preview placeholder — set GEMINI_API_KEY on the server for real edits
                </span>
              )}
              <div className="input-with-mic">
                <textarea
                  className="point-prompt"
                  rows={2}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={`Change V${currentImage?.version} — e.g. "add horns to the head"`}
                  disabled={editing}
                />
                <MicButton onTranscript={appendSpeech} disabled={editing} />
              </div>
              <button
                className="submit"
                onClick={applyEdit}
                disabled={editing || !instruction.trim()}
              >
                {editing ? 'Editing…' : 'Apply edit → new version'}
              </button>
              {lastEdit && !editing && (
                <button className="ghost-button" onClick={regenerate} title="Another take on the last change">
                  ↻ Regenerate last change
                </button>
              )}
              {editError && <span className="url-error">{editError}</span>}

              <button
                className="submit gen-go"
                onClick={rebuild3D}
                disabled={editing || gen3d.generating}
                title="Rebuild this photo into a new 3D model (kept as a new version)"
              >
                {gen3d.generating ? `Building 3D… ${gen3d.task.progress}%` : `🧊 Rebuild V${currentImage?.version} in 3D`}
              </button>
              {gen3d.generating && (
                <div className="progress" aria-hidden="true">
                  <div className="progress-fill" style={{ width: `${gen3d.task.progress}%` }} />
                </div>
              )}
              {gen3d.generating && gen3d.task.mock && (
                <span className="hint">mock mode — set MESHY_API_KEY for a real rebuild</span>
              )}
              {gen3d.error && <span className="url-error">{gen3d.error}</span>}
            </div>
            <div className="image-lab-versions">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`version-card ${v.id === currentId ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentId(v.id)
                    setStub((v.mime || '').includes('svg'))
                    setEditError(null)
                  }}
                  title={v.prompt || `version ${v.version}`}
                >
                  <img src={v.url} alt={`V${v.version}`} />
                  <span className="version-tag">V{v.version}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="link-button" onClick={capture} disabled={capturing}>
            {capturing ? 'Capturing…' : '↺ Recapture from model'}
          </button>
        </>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
