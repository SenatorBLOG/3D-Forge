import { useEffect, useState } from 'react'
import { getThumbnail } from '../lib/thumbnailer.js'

/** One version thumbnail — renders the GLB to a PNG once (cached) via thumbnailer. */
function VersionThumb({ version, index, active, onSelect }) {
  const [thumb, setThumb] = useState(null)
  useEffect(() => {
    let cancelled = false
    setThumb(null)
    getThumbnail(version.modelUrl)
      .then((u) => !cancelled && setThumb(u.shaded))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [version.modelUrl])

  return (
    <button
      type="button"
      className={`mversion-card ${active ? 'active' : ''}`}
      onClick={() => onSelect(version)}
      title={version.label || `version ${index + 1}`}
    >
      {thumb ? <img src={thumb} alt={`V${index + 1}`} /> : <span className="mversion-ph" />}
      <span className="mversion-tag">V{index + 1}</span>
    </button>
  )
}

/**
 * Vertical strip of 3D model versions at the right edge of the viewer. Every
 * generation/edit/part-swap appends a version (branch by parentId), so an edit
 * you dislike never destroys the model you liked — click an older card to load
 * it back, then edit from there.
 */
export default function ModelVersionStrip({ versions, currentId, onSelect }) {
  if (!versions || versions.length < 2) return null // nothing to compare against yet
  return (
    <div className="mversion-strip" aria-label="Model versions">
      <span className="mversion-title">Versions</span>
      {versions.map((v, i) => (
        <VersionThumb
          key={v.id}
          version={v}
          index={i}
          active={v.id === currentId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
