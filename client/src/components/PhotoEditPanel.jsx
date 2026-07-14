import { useState } from 'react'
import { getThumbnail } from '../lib/thumbnailer.js'

/**
 * Photo-based partial edit (plan: docs/plans/partial-3d-edit.md).
 * P1a — capture the currently-loaded 3D model as an image (render → upload) so it
 * can enter the Gemini edit loop. Editing the photo (P1b) and rebuilding it in 3D
 * (P1c) land next; the original model is never lost (it stays a version).
 */
export default function PhotoEditPanel({ modelUrl }) {
  const [capturing, setCapturing] = useState(false)
  const [image, setImage] = useState(null) // stored render: { id, url, ... }
  const [error, setError] = useState(null)

  const capture = async () => {
    if (!modelUrl || capturing) return
    setCapturing(true)
    setError(null)
    try {
      // render the current model to a PNG (front view), reusing the thumbnailer
      const { shaded } = await getThumbnail(modelUrl)
      if (!shaded) throw new Error('Could not render the model')
      const blob = await (await fetch(shaded)).blob()
      // store it as an image so the Gemini edit loop (P1b) can work on its bytes
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/png' },
        body: blob,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setImage(data.image)
    } catch (e) {
      setError(e.message)
    } finally {
      setCapturing(false)
    }
  }

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
      {!image ? (
        <button className="submit" onClick={capture} disabled={!modelUrl || capturing}>
          {capturing ? 'Capturing…' : '📷 Capture this model'}
        </button>
      ) : (
        <div className="field">
          <label>Captured photo</label>
          <div className="image-drop has-image">
            <img className="image-drop-preview" src={image.url} alt="captured model" />
          </div>
          <span className="hint">Next: describe a change, then rebuild in 3D.</span>
          <button className="link-button" onClick={() => setImage(null)}>
            Recapture
          </button>
        </div>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
