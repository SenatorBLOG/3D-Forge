import { useEffect, useState } from 'react'
import { getThumbnail, captureViews } from '../lib/thumbnailer.js'
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
export default function PhotoEditPanel({ modelUrl, onModelReady3D, getFrontAz }) {
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
  // the prepared views (edit applied) shown BIG before we spend Tripo credits —
  // [{ id, url, label }]. Null until "Prepare views" runs.
  const [mvViews, setMvViews] = useState(null)
  // how many views to reconstruct from: 1 (quick test), 2 (front+side), 4 (best)
  const [mvCount, setMvCount] = useState(4)
  // 4.3 per-view editing: click a prepared view → give it its OWN prompt → only
  // that view re-renders (e.g. "add a backpack" on the Back only), others stay.
  const [mvSel, setMvSel] = useState(null) // selected view index, or null
  const [mvSelPrompt, setMvSelPrompt] = useState('')
  const [mvSelBusy, setMvSelBusy] = useState(false)
  // centered lightbox: which prepared view is open big (index), or null. Flipping
  // arrows keeps mvSel in sync so the in-lightbox edit targets the shown view.
  const [lightIdx, setLightIdx] = useState(null)
  const openLight = (i) => {
    setLightIdx(i)
    setMvSel(i)
    setMvSelPrompt('')
  }
  const moveLight = (d) =>
    setLightIdx((i) => {
      if (i == null || !mvViews?.length) return i
      const n = (i + d + mvViews.length) % mvViews.length
      setMvSel(n)
      setMvSelPrompt('')
      return n
    })

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
    setMvCount(4)
    setMvSel(null)
    setMvSelPrompt('')
    setLightIdx(null)
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
  // Step 1 (free-ish): render `mvCount` CLEAN straight-on views (0/90/180/270,
  // level — no ¾ tilt), apply the SAME confirmed edit to EVERY view (incl. the
  // front, so it matches the others in style), and show them big before spending
  // credits. Clean + uniform views are what stops the reconstruction "mush".
  const prepareMvViews = async () => {
    if (!lastEdit || mvBusy || gen3d.generating || genMV.generating) return
    setMvBusy(true)
    setMvError(null)
    setMvViews(null)
    try {
      // Front slot = the live viewer's current yaw, so labels match what you see.
      const { views } = await captureViews(modelUrl, mvCount, getFrontAz?.())
      if (!views?.length) throw new Error('Could not render views')
      const prepared = []
      for (const v of views) {
        const blob = await (await fetch(v.dataUrl)).blob()
        const up = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/png' },
          body: blob,
        })
        const upData = await readJson(up)
        const ed = await fetch(`/api/images/${encodeURIComponent(upData.image.id)}/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // NO reference image (that made Gemini redraw every view to match the
          // front → identical). Each view is already the correct rendered ANGLE;
          // we tell Gemini WHICH side this is so it applies the change sensibly
          // (e.g. a helmet shows from the back) and keeps the pose from that angle.
          body: JSON.stringify({
            instruction: `${lastEdit.instruction}. (This image is the ${v.label} (${v.label === 'Back' ? 'rear' : v.label === 'Front' ? 'front' : 'three-quarter'}) view of the same character — keep this exact camera angle and pose.)`,
          }),
        })
        const edData = await readJson(ed)
        prepared.push({ id: edData.image.id, url: edData.image.url, label: v.label })
      }
      setMvViews(prepared)
    } catch (e) {
      setMvError(e.message)
    } finally {
      setMvBusy(false)
    }
  }

  // Step 2: reconstruct the model from the shown views — 1 view → image→3D,
  // 2–4 views → Tripo multiview (~30 credits). Result lands as a new version.
  const buildMultiview = async () => {
    if (!mvViews?.length || genMV.generating) return
    setMvError(null)
    try {
      if (mvViews.length < 2) {
        // single clean view → Tripo image→3D
        await genMV.start(
          '/api/generate',
          { mode: 'image', imageId: mvViews[0].id, engine: 'tripo' },
          { prompt: 'single-view' },
        )
      } else {
        await genMV.start(
          '/api/generate/multiview',
          // send slot labels so Back lands in Tripo's real BACK slot (front+back
          // 2-view would otherwise map Back → the LEFT slot and mangle the model)
          {
            imageIds: mvViews.map((v) => v.id),
            slots: mvViews.map((v) => (v.label || '').toLowerCase()),
          },
          { prompt: 'multi-view' },
        )
      }
    } catch (e) {
      setMvError(e.message)
    }
  }

  // 4.3: re-edit ONLY the selected view with its own prompt (others untouched),
  // so "add a backpack" lands on the Back view alone and the model still agrees
  // on every other side. Chains on that view's current image.
  const editMvView = async () => {
    const i = mvSel
    const instr = mvSelPrompt.trim()
    if (i == null || !instr || mvSelBusy || genMV.generating) return
    setMvSelBusy(true)
    setMvError(null)
    try {
      const ed = await fetch(`/api/images/${encodeURIComponent(mvViews[i].id)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // no reference — keep THIS view's own angle; only apply the change to it
        body: JSON.stringify({ instruction: instr }),
      })
      const edData = await readJson(ed)
      setMvViews((prev) =>
        prev.map((v, idx) => (idx === i ? { ...v, id: edData.image.id, url: edData.image.url } : v)),
      )
      setMvSelPrompt('')
    } catch (e) {
      setMvError(e.message)
    } finally {
      setMvSelBusy(false)
    }
  }

  const loadVersions = async (id) => {
    const res = await fetch(`/api/images/${encodeURIComponent(id)}/versions`)
    const data = await readJson(res) // tolerant of an empty body (server reload)
    setVersions(data.versions || [])
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
      const data = await readJson(res) // tolerant of an empty body (server reload)
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
      const data = await readJson(res) // tolerant of an empty body (server reload)
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
      <span className="tool-label">Photo edit</span>

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
                  placeholder={`Change ${currentImage?.version ? `V${currentImage.version}` : 'the photo'} — e.g. "add horns to the head"`}
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

              {/* Multi-view: pick view count → render clean views → preview → build */}
              <div className="mv-count" role="radiogroup" aria-label="How many views">
                <span className="hint">Views:</span>
                {[
                  [1, '1 · quick'],
                  [2, '2 · front+side'],
                  [4, '4 · best'],
                ].map(([n, label]) => (
                  <button
                    key={n}
                    type="button"
                    className={`mv-count-btn ${mvCount === n ? 'on' : ''}`}
                    aria-pressed={mvCount === n}
                    disabled={mvBusy || genMV.generating}
                    onClick={() => {
                      setMvCount(n)
                      setMvViews(null)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="ghost-button"
                onClick={prepareMvViews}
                disabled={editing || mvBusy || gen3d.generating || genMV.generating || !lastEdit}
                title={
                  lastEdit
                    ? 'Render clean straight-on views with your change applied, and preview them before rebuilding'
                    : 'Make an edit first — it is applied to every view'
                }
              >
                {mvBusy
                  ? `Rendering ${mvCount} view${mvCount > 1 ? 's' : ''}…`
                  : `🖼️×${mvCount} Prepare ${mvCount} view${mvCount > 1 ? 's' : ''}`}
              </button>

              {mvViews && (
                <>
                  <div className="mv-views">
                    {mvViews.map((v, i) => (
                      <figure
                        className={`mv-view ${mvSel === i ? 'sel' : ''}`}
                        key={`${i}-${v.id}`}
                        onClick={() => openLight(i)}
                        title={`Click to view large & edit the ${v.label} view`}
                      >
                        <img src={v.url} alt={v.label} />
                        <figcaption>{v.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                  {mvViews.length > 1 && (
                    <span className="hint">Click a view to open it large & edit that side.</span>
                  )}
                  {mvSel != null && lightIdx == null && mvViews[mvSel] && (
                    <div className="mv-view-edit">
                      <textarea
                        className="point-prompt"
                        rows={2}
                        value={mvSelPrompt}
                        onChange={(e) => setMvSelPrompt(e.target.value)}
                        placeholder={`Change only the ${mvViews[mvSel].label} view — e.g. "add a backpack"`}
                        disabled={mvSelBusy}
                      />
                      <button
                        className="submit"
                        onClick={editMvView}
                        disabled={mvSelBusy || !mvSelPrompt.trim()}
                      >
                        {mvSelBusy ? 'Editing…' : `Apply to ${mvViews[mvSel].label} only`}
                      </button>
                    </div>
                  )}
                </>
              )}

              {mvViews && (
                <button
                  className="submit gen-go"
                  onClick={buildMultiview}
                  disabled={genMV.generating}
                  title={
                    mvViews.length < 2
                      ? 'Reconstruct from this 1 view with Tripo image→3D (~20 credits)'
                      : `Reconstruct from these ${mvViews.length} views with Tripo multi-view (~30 credits)`
                  }
                >
                  {genMV.generating
                    ? `Building… ${genMV.task.progress}%`
                    : mvViews.length < 2
                      ? '🧊 Build 3D from this view (Tripo)'
                      : `🧊 Build 3D from these ${mvViews.length} views (Tripo)`}
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

              {/* quick single-photo Meshy rebuild — disabled for now, shown at the
                  bottom only once views exist (the Tripo build above is primary) */}
              {mvViews && (
                <button
                  className="ghost-button"
                  disabled
                  title="Quick single-photo rebuild (Meshy) is off for now — use Build 3D above."
                >
                  🧊 Rebuild {currentImage?.version ? `V${currentImage.version}` : 'photo'} in 3D (soon)
                </button>
              )}
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

      {/* centered photo viewer: flip between the prepared views (arrows), and edit
          just the shown view — without the thumbnail ballooning over the panel */}
      {lightIdx != null && mvViews?.[lightIdx] && (
        <div className="photo-light" onClick={() => setLightIdx(null)}>
          <div className="photo-light-box" onClick={(e) => e.stopPropagation()}>
            <div className="photo-light-head">
              <span>
                {mvViews[lightIdx].label} · {lightIdx + 1}/{mvViews.length}
              </span>
              <button
                type="button"
                className="point-popup-close"
                onClick={() => setLightIdx(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="photo-light-main">
              {mvViews.length > 1 && (
                <button type="button" className="photo-light-arrow" onClick={() => moveLight(-1)} aria-label="Previous">
                  ‹
                </button>
              )}
              <img src={mvViews[lightIdx].url} alt={mvViews[lightIdx].label} />
              {mvViews.length > 1 && (
                <button type="button" className="photo-light-arrow" onClick={() => moveLight(1)} aria-label="Next">
                  ›
                </button>
              )}
            </div>
            <div className="photo-light-edit">
              <textarea
                className="point-prompt"
                rows={2}
                value={mvSelPrompt}
                onChange={(e) => setMvSelPrompt(e.target.value)}
                placeholder={`Change only the ${mvViews[lightIdx].label} — e.g. "add a shield"`}
                disabled={mvSelBusy}
              />
              <button className="submit" onClick={editMvView} disabled={mvSelBusy || !mvSelPrompt.trim()}>
                {mvSelBusy ? 'Editing…' : `Apply to ${mvViews[lightIdx].label} only`}
              </button>
              {mvError && <span className="url-error">{mvError}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
