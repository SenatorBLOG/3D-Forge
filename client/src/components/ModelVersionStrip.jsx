import { useEffect, useState } from 'react'
import { getThumbnail } from '../lib/thumbnailer.js'

/** One version thumbnail — renders the GLB to a PNG once (cached) via thumbnailer. */
function VersionThumb({ version, index, active, onSelect, onDelete }) {
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
    <div className={`mversion-item ${active ? 'active' : ''}`}>
      <button
        type="button"
        className="mversion-card"
        onClick={() => onSelect(version)}
        title={version.label || `version ${index + 1}`}
      >
        {thumb ? <img src={thumb} alt={`V${index + 1}`} /> : <span className="mversion-ph" />}
        <span className="mversion-tag">V{index + 1}</span>
      </button>
      <button
        type="button"
        className="mversion-del"
        onClick={() => onDelete(version)}
        title="Remove this version"
        aria-label="Remove version"
      >
        ✕
      </button>
    </div>
  )
}

/**
 * Vertical strip of 3D model versions at the right edge of the viewer. Every
 * generation/edit/part-swap appends a version (branch by parentId), so an edit
 * you dislike never destroys the model you liked — click an older card to load
 * it back, ✕ to prune ones you don't want, and keep/download/send-to-library the
 * one you settle on.
 */
export default function ModelVersionStrip({
  versions,
  currentId,
  onSelect,
  onDelete,
  onDownload,
  onToLibrary,
}) {
  if (!versions || versions.length < 2) return null // nothing to compare against yet
  const current = versions.find((v) => v.id === currentId)
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
          onDelete={onDelete}
        />
      ))}
      {current && (
        <div className="mversion-actions">
          <button type="button" onClick={() => onDownload?.(current)} title="Download this version (.glb)">
            ⤓
          </button>
          <button type="button" onClick={() => onToLibrary?.(current)} title="Save this version to the Library">
            ↗
          </button>
        </div>
      )}
    </div>
  )
}
