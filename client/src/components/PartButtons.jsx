import { useEffect, useMemo, useState } from 'react'

/**
 * P3 + Task 7 — part buttons under the model. Segments the model
 * (POST /api/edit/segment) and shows a chip per part: hover highlights that
 * part's bbox in the viewer, click SELECTS it (the left panel adapts to that
 * scope; click again to deselect — back to the whole model).
 *
 * Task 7 (grouping): segmentation often splits one real region (an arm) into
 * 3-4 pieces. "Group" mode lets you tick several pieces and merge them into ONE
 * named group that acts as a single part. Only pieces that actually TOUCH can be
 * grouped (a whole arm — yes; a left arm + right leg — no), checked by bbox
 * adjacency so a group is always one connected region.
 */

// union of several {min,max} bboxes → one enclosing box + its center
function unionBox(boxes) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    if (!b) continue
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i])
      max[i] = Math.max(max[i], b.max[i])
    }
  }
  return { min, max }
}
const centerOf = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]

// two boxes touch/overlap when their intervals overlap on every axis (within a
// per-axis tolerance derived from the model size — segmentation leaves tiny gaps)
function boxesTouch(a, b, tol) {
  for (let i = 0; i < 3; i++) {
    if (a.min[i] > b.max[i] + tol[i]) return false
    if (b.min[i] > a.max[i] + tol[i]) return false
  }
  return true
}

// is the selected set ONE connected cluster (every member reachable from any
// other through touching members only)? Prevents grouping detached regions.
function allConnected(members, tol) {
  if (members.length < 2) return true
  const seen = new Set([0])
  const stack = [0]
  while (stack.length) {
    const i = stack.pop()
    for (let j = 0; j < members.length; j++) {
      if (seen.has(j)) continue
      if (boxesTouch(members[i].bbox, members[j].bbox, tol)) {
        seen.add(j)
        stack.push(j)
      }
    }
  }
  return seen.size === members.length
}

export default function PartButtons({
  modelUrl,
  description = '',
  onHoverPart,
  onPickPart,
  onParts,
  onBake,
  onGroupingChange,
  partClickSignal = null, // {name, ts} — a part clicked directly in the 3D viewer
  selectedId = null,
  busy,
}) {
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState([]) // [{ id, name, partIds:[], names:[], bbox, center }]
  const [grouping, setGrouping] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [nameDraft, setNameDraft] = useState('')
  const [labeling, setLabeling] = useState(false) // AI auto-label in flight
  const [labelErr, setLabelErr] = useState(null)
  const [baking, setBaking] = useState(false) // group→bake in flight

  // let the parent (and viewer) know when group-select mode is on, so a single
  // click on the model toggles a part's membership (same as ticking its chip)
  useEffect(() => {
    onGroupingChange?.(grouping)
  }, [grouping, onGroupingChange])

  // a part clicked directly in the 3D model → toggle it in the group selection
  useEffect(() => {
    if (!partClickSignal || !grouping) return
    const hit = parts.find((p) => p.name === partClickSignal.name && !groupedIds.has(p.id))
    if (hit) toggleSelect(hit.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partClickSignal])

  useEffect(() => {
    let cancelled = false
    setParts([])
    setGroups([])
    setGrouping(false)
    setSelected(new Set())
    setLabelErr(null)
    onHoverPart?.(null)
    onParts?.([])
    if (!modelUrl) return
    setLoading(true)
    fetch('/api/edit/segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelUrl }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const ps = d?.parts || []
        setParts(ps)
        onParts?.(ps) // lift parts so a 3D double-click can resolve mesh → part
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl])

  // per-axis adjacency tolerance = 6% of the model's overall extent
  const tol = useMemo(() => {
    if (parts.length < 2) return [0, 0, 0]
    const u = unionBox(parts.map((p) => p.bbox))
    return [0, 1, 2].map((i) => Math.max(1e-4, (u.max[i] - u.min[i]) * 0.06))
  }, [parts])

  const groupedIds = useMemo(() => new Set(groups.flatMap((g) => g.partIds)), [groups])
  const looseParts = parts.filter((p) => !groupedIds.has(p.id))

  const selMembers = parts.filter((p) => selected.has(p.id))
  const connected = allConnected(selMembers, tol)

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ONE step: grouping the selected parts BAKES them into a single real merged
  // part (server rebuilds the model, result loads as a new version). No separate
  // "bake" click — a group only mattered once it's a real part.
  const makeGroup = async () => {
    const members = parts.filter((p) => selected.has(p.id))
    if (members.length < 2 || !allConnected(members, tol) || baking) return
    const name = nameDraft.trim() || 'Group'
    setBaking(true)
    try {
      await onBake?.([{ name, partIds: members.map((m) => m.id) }])
      setSelected(new Set())
      setNameDraft('')
      setGrouping(false)
    } finally {
      setBaking(false)
    }
  }

  const ungroup = (id) => setGroups((prev) => prev.filter((g) => g.id !== id))

  // AI auto-label: ask the server (Claude) to rename the geometric parts by their
  // spatial layout ("part 1" → "Head", "Left Arm"…). One paid text call, fired
  // only by this click. Renames the loose part chips; groups keep their own names.
  const autoLabel = async () => {
    if (labeling || busy || !modelUrl) return
    setLabelErr(null)
    setLabeling(true)
    try {
      const r = await fetch('/api/edit/label-parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelUrl, description }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      const labels = d.labels || {}
      if (!Object.keys(labels).length) {
        setLabelErr('No labels came back — try again.')
        return
      }
      setParts((prev) => {
        const next = prev.map((p) => (labels[p.id] ? { ...p, name: labels[p.id] } : p))
        onParts?.(next)
        return next
      })
    } catch (e) {
      setLabelErr(e.message || 'Auto-label failed')
    } finally {
      setLabeling(false)
    }
  }

  if (loading) return <div className="part-buttons part-buttons--loading">Finding parts…</div>
  if (parts.length < 2) return null // nothing useful to split

  return (
    <div className="part-buttons" onMouseLeave={() => onHoverPart?.(null)}>
      <span className="part-buttons-label">Parts</span>

      {/* group chips — merged regions; click selects (scope), ✕ ungroups */}
      {groups.map((g) => {
        const active = selectedId === g.id
        return (
          <span
            key={g.id}
            className={`part-chip part-chip--group ${active ? 'part-chip--active' : ''}`}
            title={`Group "${g.name}"`}
          >
            <button
              type="button"
              className="part-chip-main"
              disabled={busy || grouping}
              onMouseEnter={() => onHoverPart?.(g.bbox)}
              onFocus={() => onHoverPart?.(g.bbox)}
              onClick={() => onPickPart?.(active ? null : { ...g, isGroup: true })}
            >
              ⧉ {g.name} · {g.partIds.length}
            </button>
            <button
              type="button"
              className="part-chip-x"
              disabled={busy}
              onClick={() => {
                if (active) onPickPart?.(null)
                ungroup(g.id)
              }}
              title="Ungroup"
              aria-label={`Ungroup ${g.name}`}
            >
              ✕
            </button>
          </span>
        )
      })}

      {/* loose parts */}
      {looseParts.map((p) => {
        const isSel = selected.has(p.id) // group-mode tick
        const active = selectedId === p.id // scope selection
        return (
          <button
            key={p.id}
            type="button"
            className={`part-chip ${grouping && isSel ? 'part-chip--sel' : ''} ${
              !grouping && active ? 'part-chip--active' : ''
            }`}
            disabled={busy}
            aria-pressed={grouping ? isSel : active}
            onMouseEnter={() => onHoverPart?.(p.bbox)}
            onFocus={() => onHoverPart?.(p.bbox)}
            onClick={() => (grouping ? toggleSelect(p.id) : onPickPart?.(active ? null : p))}
            title={grouping ? 'Tick to add/remove from the group' : `Select the "${p.name}" part`}
          >
            {p.name}
          </button>
        )
      })}

      {/* group toolbar */}
      {!grouping ? (
        <>
          <button
            type="button"
            className="part-group-toggle"
            disabled={busy || looseParts.length < 2}
            onClick={() => setGrouping(true)}
            title="Merge several touching parts into one region (e.g. a whole arm)"
          >
            ⧉ Group
          </button>
          <button
            type="button"
            className="part-label-ai"
            disabled={busy || labeling}
            onClick={autoLabel}
            title="Let AI rename the parts by where they sit (Head, Left Arm, Wheel…)"
          >
            {labeling ? 'Labeling…' : '🏷 Auto-label (AI)'}
          </button>
          {labelErr && <span className="part-group-warn">⚠ {labelErr}</span>}
        </>
      ) : (
        <span className="part-group-bar">
          <input
            className="part-group-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="name e.g. FullArm"
            maxLength={24}
          />
          <button
            type="button"
            className="part-group-make"
            disabled={selected.size < 2 || !connected || baking}
            onClick={makeGroup}
            title={
              selected.size < 2
                ? 'Pick at least two parts (tick a chip or click the part on the model)'
                : connected
                  ? 'Merge the selected parts into ONE real part'
                  : 'These parts are not all connected'
            }
          >
            {baking ? 'Merging…' : `Merge (${selected.size})`}
          </button>
          <button
            type="button"
            className="part-group-cancel"
            onClick={() => {
              setGrouping(false)
              setSelected(new Set())
              setNameDraft('')
            }}
          >
            Cancel
          </button>
          {selected.size >= 2 && !connected && (
            <span className="part-group-warn">⚠ parts aren’t all connected — pick a touching region</span>
          )}
        </span>
      )}
    </div>
  )
}
