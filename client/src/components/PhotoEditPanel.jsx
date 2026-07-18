import { useEffect, useState } from 'react'
import { getThumbnail } from '../lib/thumbnailer.js'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

// Read a fetch response as JSON without throwing the cryptic "Unexpected end of
// JSON input" when the body is empty — which happens when the dev server is
// mid-restart (node --watch). Turn that into a clear, retryable message.
async function readJson(res) {
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    /* non-JSON body (HTML error page, etc.) */
  }
  if (!res.ok) {
    throw new Error(
      data.error || `HTTP ${res.status}${text ? '' : ' — empty response (server restarting? try again)'}`,
    )
  }
  return data
}

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
  const [mvBusy, setMvBusy] = useState(false) // capture+upload phase of a multi-view rebuild
  const [mvError, setMvError] = useState(null)
  // the 3 prepared views (front + side + back, edit applied) shown BIG before we
  // spend Tripo credits — [{ id, url, label }]. Null until "Prepare views" runs.
  const [mvViews, setMvViews] = useState(null)

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
    setMvError(null)
    setMvViews(null)
  }, [modelUrl])

  // P1c: rebuild the chosen photo into 3D. The result is handed up to the Forge,
  // which loads it as a NEW model version (a child of the current model) — the
  // original is kept, so a rebuild you dislike never loses it.
  const gen3d = useGenerationTask((url) =>
    onModelReady3D?.(url, currentImage?.prompt ? `Photo: ${currentImage.prompt}` : 'Photo edit'),
  )
  const rebuild3D = () => {
    if (!currentId || gen3d.generating || genMV.generating) return
    gen3d.start(
      '/api/generate',
      { mode: 'image', imageId: currentId, model: 'meshy-5', engine: 'meshy' },
      { refine: false, model: 'meshy-5', prompt: 'photo edit' },
    )
  }

  // P1.5 fidelity path: after you've confirmed a front edit, apply the SAME change
  // to the model's side & back renders too — so all three views are consistently
  // updated — then Tripo multiview reconstructs a model that keeps the original
  // body. Tripo-only; mock-safe (no key → mock model, free).
  const genMV = useGenerationTask((url) =>
    onModelReady3D?.(url, lastEdit?.instruction ? `Multi-view: ${lastEdit.instruction}` : 'Multi-view edit'),
  )
  // Step 1 (free-ish): render the model from front/side/back, apply the SAME
  // confirmed edit to the side & back, and SHOW all three big so the user sees
  // exactly what will be sent to Tripo before spending credits.
  const prepareMvViews = async () => {
    if (!currentId || !lastEdit || mvBusy || gen3d.generating || genMV.generating) return
    setMvBusy(true)
    setMvError(null)
    setMvViews(null)
    try {
      const { views } = await getThumbnail(modelUrl) // extra angles (90°/180°/270°)
      // Tripo multiview wants 4 slots [front, left, back, right] — views[] is
      // exactly [left(90°), back(180°), right(270°)], so front + all three = 4.
      const extraViews = (views || []).slice(0, 3)
      if (!extraViews.length) throw new Error('Could not render extra views')
      const prepared = [{ id: currentId, url: currentImage?.url, label: 'Front' }]
      const labels = ['Left', 'Back', 'Right']
      for (let i = 0; i < extraViews.length; i++) {
        const blob = await (await fetch(extraViews[i])).blob()
        const up = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/png' },
          body: blob,
        })
        const upData = await readJson(up)
        // apply the SAME instruction so all three views agree
        const ed = await fetch(`/api/images/${encodeURIComponent(upData.image.id)}/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: lastEdit.instruction }),
        })
        const edData = await readJson(ed)
        prepared.push({ id: edData.image.id, url: edData.image.url, label: labels[i] })
      }
      setMvViews(prepared)
    } catch (e) {
      setMvError(e.message)
    } finally {
      setMvBusy(false)
    }
  }

  // Step 2 (~30 Tripo credits): reconstruct the whole model from the 3 shown views.
  const buildMultiview = async () => {
    if (!mvViews?.length || genMV.generating) return
    setMvError(null)
    try {
      await genMV.start(
        '/api/generate/multiview',
        { imageIds: mvViews.map((v) => v.id) },
        { prompt: 'multi-view' },
      )
    } catch (e) {
      setMvError(e.message)
    }
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
        <span className="spatial-flag">✎ Edit</span>
        <h2>Edit this model</h2>
      </div>
      <p className="spatial-blurb">
        Capture the model as a photo, describe the change, then rebuild it in 3D — the
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

              {/* Multi-view: step 1 renders & shows 3 big views, step 2 spends Tripo */}
              <button
                className="ghost-button"
                onClick={prepareMvViews}
                disabled={editing || mvBusy || gen3d.generating || genMV.generating || !lastEdit}
                title={
                  lastEdit
                    ? 'Render front + side + back with your change applied, and preview them before rebuilding'
                    : 'Make an edit first — multi-view applies it to all sides'
                }
              >
                {mvBusy ? 'Rendering 4 views…' : '🖼️×4 Prepare 4 views'}
              </button>

              {mvViews && (
                <div className="mv-views">
                  {mvViews.map((v) => (
                    <figure className="mv-view" key={v.id}>
                      <img src={v.url} alt={v.label} />
                      <figcaption>{v.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {mvViews && (
                <button
                  className="submit gen-go"
                  onClick={buildMultiview}
                  disabled={genMV.generating}
                  title="Reconstruct the whole model from these 4 views with Tripo (~30 credits)"
                >
                  {genMV.generating
                    ? `Multi-view… ${genMV.task.progress}%`
                    : '🧊 Build 3D from these 4 views (Tripo)'}
                </button>
              )}
              {genMV.generating && (
                <div className="progress" aria-hidden="true">
                  <div className="progress-fill" style={{ width: `${genMV.task.progress}%` }} />
                </div>
              )}
              {genMV.generating && genMV.task.mock && (
                <span className="hint">mock mode — set TRIPO_API_KEY for a real multi-view rebuild</span>
              )}
              {(mvError || genMV.error) && <span className="url-error">{mvError || genMV.error}</span>}
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
