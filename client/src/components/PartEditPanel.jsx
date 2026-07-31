import { useEffect, useRef, useState } from 'react'
import { getThumbnail, captureViews } from '../lib/thumbnailer.js'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

/**
 * P4 — part-only edit (experimental "wow" path, docs/plans/partial-3d-edit.md):
 * extract ONE part → photograph it → edit the photo by prompt (Gemini) → rebuild
 * JUST that part in 3D → stitch it back into the original at the part's bbox.
 * Everything outside the part stays byte-identical; seams are the accepted
 * tradeoff. Mock-safe end to end (stub photo edits, mock 3D, real stitch).
 */
export default function PartEditPanel({ modelUrl, part, onClose, onStitched, getFrontAz }) {
  const [phase, setPhase] = useState('extracting') // extracting | ready | stitching
  const [image, setImage] = useState(null) // current photo of the part { id, url }
  const [instruction, setInstruction] = useState('')
  const [lastEdit, setLastEdit] = useState(null) // { sourceId, instruction }
  const [editing, setEditing] = useState(false)
  const [stub, setStub] = useState(false)
  const [error, setError] = useState(null)
  // 4.4 — how many views to rebuild the PART from. Clean, axis-aligned views
  // (0/90/180/270) also help the rebuilt part come back in the right orientation,
  // so it stitches straighter. 1 = quick/cheap; 4 = best.
  // A GROUP (a whole arm) rebuilds from 4 clean axis-aligned views by default:
  // multiview returns a TEXTURED mesh (texture:true) and the level 0/90/180/270
  // shots come back straighter than a single hallucinated front photo. A single
  // part defaults to the quick 1-view path.
  const [pvCount, setPvCount] = useState(part.isGroup ? 4 : 1)

  // the part identity this panel works on — a swap of the underlying model closes it
  const partIdRef = useRef(part?.id)
  const partUrlRef = useRef(null) // the extracted part's GLB, for clean multi-view capture

  // step 1: extract the part → its own GLB → photograph it → stored image
  useEffect(() => {
    let cancelled = false
    setPhase('extracting')
    setImage(null)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/edit/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // a group edits its combined region as one (partIds); a single part by id
          body: JSON.stringify({
            modelUrl,
            ...(part.isGroup ? { partIds: part.partIds, name: part.name } : { partId: part.id }),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        partUrlRef.current = data.partUrl
        const { shaded } = await getThumbnail(data.partUrl)
        if (cancelled) return
        const blob = await (await fetch(shaded)).blob()
        const up = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/png' },
          body: blob,
        })
        const upData = await up.json()
        if (!up.ok) throw new Error(upData.error || `HTTP ${up.status}`)
        if (cancelled) return
        setImage(upData.image)
        setPhase('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e.message)
          setPhase('ready')
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, part.id])

  // step 2: edit the part's photo by prompt (new image each time; re-roll = same again)
  const runEdit = async (sourceId, text) => {
    const instr = text.trim()
    if (!instr || !sourceId || editing) return
    setEditing(true)
    setError(null)
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
      setImage(data.image)
    } catch (e) {
      setError(e.message)
    } finally {
      setEditing(false)
    }
  }
  const applyEdit = () => {
    runEdit(image?.id, instruction)
    setInstruction('')
  }
  const regenerate = () => lastEdit && runEdit(lastEdit.sourceId, lastEdit.instruction)

  // step 3: rebuild JUST this part in 3D, then stitch it back at the part's bbox
  const gen = useGenerationTask(async (partModelUrl) => {
    setPhase('stitching')
    try {
      const res = await fetch('/api/edit/stitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelUrl,
          partModelUrl,
          ...(part.isGroup ? { partIds: part.partIds, name: part.name } : { partId: partIdRef.current }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onStitched?.(
        data.modelUrl,
        `Part: ${part.name}${lastEdit ? ` — ${lastEdit.instruction}` : ''}`,
      )
    } catch (e) {
      setError(e.message)
      setPhase('ready')
    }
  })
  const rebuildPart = async () => {
    if (!image?.id || gen.generating) return
    // 1 view → Tripo image→3D from the (edited) part photo. >1 → render clean
    // axis-aligned views of the extracted part, apply the same edit to each, and
    // rebuild via Tripo multi-view — better shape AND straighter orientation.
    if (pvCount <= 1 || !partUrlRef.current) {
      gen.start(
        '/api/generate',
        { mode: 'image', imageId: image.id, engine: 'tripo' },
        { refine: false, prompt: `part: ${part.name}` },
      )
      return
    }
    setError(null)
    try {
      // Front slot = the live viewer's current yaw, so labels match what you see.
      const { views } = await captureViews(partUrlRef.current, pvCount, getFrontAz?.())
      if (!views?.length) throw new Error('Could not render part views')
      const ids = []
      const slots = [] // slot label per view, so Back → Tripo's real BACK slot
      let edits = 0 // how many view-edits actually succeeded
      for (const v of views) {
        const blob = await (await fetch(v.dataUrl)).blob()
        const up = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/png' },
          body: blob,
        })
        const upData = await up.json()
        if (!up.ok) throw new Error(upData.error || `HTTP ${up.status}`)
        let imgId = upData.image.id
        if (lastEdit?.instruction) {
          // best-effort: applying the edit to each of the 4 views fires 4 rapid
          // Gemini calls and can hit its rate limit — if ONE view's edit fails,
          // fall back to the un-edited view instead of failing the whole rebuild
          try {
            const ed = await fetch(`/api/images/${encodeURIComponent(imgId)}/edit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instruction: lastEdit.instruction }),
            })
            const edData = await ed.json().catch(() => ({}))
            if (ed.ok && edData.image?.id) {
              imgId = edData.image.id
              edits++
            }
          } catch {
            /* keep the un-edited view */
          }
          await new Promise((r) => setTimeout(r, 1100)) // space out calls to dodge the rate limit
        }
        ids.push(imgId)
        slots.push((v.label || '').toLowerCase())
      }
      if (lastEdit?.instruction && !edits) {
        throw new Error('Image edit service is busy (rate limit) — try again, or use “1 · quick”.')
      }
      gen.start('/api/generate/multiview', { imageIds: ids, slots }, { prompt: `part: ${part.name}` })
    } catch (e) {
      setError(e.message)
    }
  }

  const appendSpeech = (t) => setInstruction((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
  const busy = editing || gen.generating || phase !== 'ready'

  return (
    <section className="panel part-edit">
      <div className="part-edit-head">
        <span className="tool-label">Edit part · {part.name}</span>
        <button type="button" className="point-popup-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {phase === 'extracting' && <span className="hint">Extracting the part…</span>}

      {image && (
        <div className="field">
          <div className="image-drop has-image">
            <img className="image-drop-preview" src={image.url} alt={`part ${part.name}`} />
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
              placeholder={`e.g. "add horns", "make it spiky"`}
              disabled={busy}
            />
            <MicButton onTranscript={appendSpeech} disabled={busy} />
          </div>
          <button className="submit" onClick={applyEdit} disabled={busy || !instruction.trim()}>
            {editing ? 'Editing…' : 'Apply edit'}
          </button>
          {lastEdit && !editing && (
            <button className="ghost-button" onClick={regenerate} disabled={busy}>
              ↻ Regenerate last change
            </button>
          )}
          <div className="mv-count" role="radiogroup" aria-label="Views to rebuild the part from">
            <span className="hint">Rebuild from:</span>
            {[
              [1, '1 · quick'],
              [2, '2 · front+side'],
              [4, '4 · best'],
            ].map(([n, label]) => (
              <button
                key={n}
                type="button"
                className={`mv-count-btn ${pvCount === n ? 'on' : ''}`}
                aria-pressed={pvCount === n}
                disabled={busy}
                onClick={() => setPvCount(n)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="submit gen-go"
            onClick={rebuildPart}
            disabled={busy}
            title="Rebuild only this part in 3D and stitch it back — the rest stays identical"
          >
            {gen.generating
              ? `Building part… ${gen.task.progress}%`
              : phase === 'stitching'
                ? 'Stitching…'
                : `🧩 Rebuild “${part.name}” & stitch`}
          </button>
          {gen.generating && (
            <div className="progress" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${gen.task.progress}%` }} />
            </div>
          )}
          {gen.generating && gen.task.mock && (
            <span className="hint">mock mode — set TRIPO_API_KEY for a real part rebuild</span>
          )}
        </div>
      )}
      {(error || gen.error) && <span className="url-error">{error || gen.error}</span>}
    </section>
  )
}
