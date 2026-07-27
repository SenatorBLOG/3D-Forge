import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
import GeneratePanel from '../components/GeneratePanel.jsx'
import LibraryPanel from '../components/LibraryPanel.jsx'
import CompareView from '../components/CompareView.jsx'
import PublishPanel from '../components/PublishPanel.jsx'
import ModelVersionStrip from '../components/ModelVersionStrip.jsx'
import PhotoEditPanel from '../components/PhotoEditPanel.jsx'
import RecolorPanel from '../components/RecolorPanel.jsx'
import PartButtons from '../components/PartButtons.jsx'
import PartEditPanel from '../components/PartEditPanel.jsx'
import AnimatePanel from '../components/AnimatePanel.jsx'
import MicButton from '../components/MicButton.jsx'
import useGenerationTask from '../hooks/useGenerationTask.js'
import { downloadModel } from '../lib/download.js'
import { toLoadableUrl } from '../lib/modelUrl.js'
import { mergeAnimatedGlbs } from '../lib/animMerge.js'

const SAMPLE_MODEL_URL = '/models/robotic_hand.glb'
const isLoadableUrl = (u) => typeof u === 'string' && /^(https?:\/\/|\/)/.test(u)

// Persist the working model + its version strip across page reloads (F5), so an
// accidental refresh doesn't wipe the version history. Only stored URLs survive
// a reload — object URLs (blob:) are dropped, since they die with the page.
const SESSION_KEY = 'forge:session'
const persistable = (u) => isLoadableUrl(u) && !String(u).startsWith('blob:')
const loadSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    return s && persistable(s.modelUrl) ? s : null
  } catch {
    return null
  }
}

// left activity-bar tools; icons are custom line-glyphs in our house style (no emoji)
const ICON = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}
const NAV_TABS = [
  {
    id: 'generate',
    label: 'Generate',
    needsModel: false,
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <path d="M12 3.4l1.9 5.2 5.2 1.9-5.2 1.9L12 17.6l-1.9-5.2L4.9 10.5l5.2-1.9L12 3.4Z" />
        <path d="M18.8 3.6v2.8M20.2 5H17.4" />
      </svg>
    ),
  },
  {
    id: 'model',
    label: 'Model',
    needsModel: false,
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4L12 2.8Z" />
        <path d="M4 7.4l8 4.6 8-4.6M12 12v9.2" />
      </svg>
    ),
  },
  {
    id: 'edit',
    label: 'Edit',
    needsModel: true,
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <path d="M4 20h4L18.4 9.6a2 2 0 0 0-2.8-2.8L5 17.2 4 20Z" />
        <path d="M14.4 8.4l2.8 2.8" />
      </svg>
    ),
  },
  {
    id: 'recolor',
    label: 'Recolor',
    needsModel: true,
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <path d="M12 3.4c3 3.4 5.5 6.3 5.5 9.4A5.5 5.5 0 0 1 6.5 12.8C6.5 9.7 9 6.8 12 3.4Z" />
      </svg>
    ),
  },
]

/** The forging tool: generate, click-select regions, edit, history, compare. */
export default function ForgePage() {
  const [searchParams] = useSearchParams()
  // deep-link from Explore: /forge?model=<url> opens that model. Otherwise the
  // canvas starts EMPTY — the create surface, not a pre-loaded hand.
  // ?model= (deep link) wins; otherwise restore the last session (survives F5).
  // Computed once (ref) so we don't re-read localStorage on every render.
  const restoredRef = useRef(undefined)
  if (restoredRef.current === undefined) {
    restoredRef.current = isLoadableUrl(searchParams.get('model')) ? null : loadSession()
  }
  const restored = restoredRef.current
  const [modelUrl, setModelUrl] = useState(() => {
    const m = searchParams.get('model')
    if (isLoadableUrl(m)) return m
    return restored?.modelUrl || null
  })
  const [modelStatus, setModelStatus] = useState(() =>
    isLoadableUrl(searchParams.get('model')) || restored?.modelUrl ? 'loading' : 'idle',
  ) // idle | loading | ready | error
  const [modelError, setModelError] = useState(null)
  // text description that produced the current model — context for edits
  const [baseModelPrompt, setBaseModelPrompt] = useState(restored?.baseModelPrompt || null)
  // how the current model was generated ('text' | 'image' | null) — published as `kind`
  const [modelKind, setModelKind] = useState(restored?.modelKind || null)
  // selected points on the mesh: [{ point: {x,y,z}, meshName, prompt }]
  const [points, setPoints] = useState([])
  // which point's inline editor is open (index, or null) — shared by the model
  // overlay and the sidebar so the two stay in sync
  const [selectedIndex, setSelectedIndex] = useState(null)
  // spatial = M3 engine (clicks + region + base); plain = bare instruction (M5
  // comparison control)
  const [spatialGrounding, setSpatialGrounding] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState(null)
  const [loadKey, setLoadKey] = useState(0)
  const objectUrlRef = useRef(null)
  const pendingEditPromptRef = useRef(null)
  const [lastEditPrompt, setLastEditPrompt] = useState(null) // { text, refinedBy }
  const [genBusy, setGenBusy] = useState(false)
  // an uploaded file being previewed but not yet saved to History (explicit Save)
  const [pendingFile, setPendingFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [compare, setCompare] = useState(null)
  // which left activity-bar tool is open: generate | model | edit | recolor
  const [activeTab, setActiveTab] = useState('generate')
  // DOM node in the Edit tab where ModelViewer portals its manual tools + brightness
  const [manualHost, setManualHost] = useState(null)
  // collapse the left tool panel to just the icon rail
  const [navCollapsed, setNavCollapsed] = useState(false)
  // collapse the right library/publish panel
  const [libCollapsed, setLibCollapsed] = useState(false)
  // Hyper3D part-swap state
  const [swapBusy, setSwapBusy] = useState(false)
  const [swapMsg, setSwapMsg] = useState(null)
  const [swapErr, setSwapErr] = useState(null)
  // P3: bbox of the part hovered in the part-buttons row, highlighted in the viewer
  const [highlightBox, setHighlightBox] = useState(null)
  // P4: the part being edited in the part-edit panel (click a part chip to open)
  const [activePart, setActivePart] = useState(null)
  // Tripo native segmentation (real parts) — only for Tripo-generated models
  const [segBusy, setSegBusy] = useState(false)
  const [segMsg, setSegMsg] = useState(null)
  // 3D model version history: every generate/edit/part-swap appends a version
  // (branch by parentId), so an edit you dislike never loses the model you kept.
  const [modelVersions, setModelVersions] = useState(
    () => (restored?.modelVersions || []).filter((v) => persistable(v.modelUrl)),
  ) // [{ id, modelUrl, label, parentId, kind }]
  const [currentVersionId, setCurrentVersionId] = useState(restored?.currentVersionId || null)
  const versionSeq = useRef(restored?.versionSeq || 0)
  const currentVersionIdRef = useRef(null)
  // imperative handle into the live viewer (recolor/exportModel), populated by
  // ModelViewer via its apiOut prop; used by the local (free) recolor flow
  const viewerApiRef = useRef({})
  currentVersionIdRef.current = currentVersionId

  // Task 6 — animation session. rigTaskId + applied clips persist across F5 and
  // are stored per-version, so an already-rigged model adds another clip for +10
  // (no re-rig). Reset when a different BASE model is loaded.
  const [showAnimate, setShowAnimate] = useState(false)
  const [rigTaskId, setRigTaskId] = useState(restored?.rigTaskId || null)
  const [appliedClips, setAppliedClips] = useState(restored?.appliedClips || [])
  const animEntriesRef = useRef(restored?.animEntries || []) // [{ preset, url }] single-clip GLBs
  const resetAnim = () => {
    setRigTaskId(null)
    setAppliedClips([])
    animEntriesRef.current = []
    setShowAnimate(false)
  }

  // Task 8 — current edit SCOPE for recolor: null = whole model, or a part/group
  // (chosen by clicking its chip). One adaptive Recolor applies to the selection.
  const [selection, setSelection] = useState(null) // null | {kind:'part',part} | {kind:'group',group}
  const selectionBox = selection
    ? selection.kind === 'group'
      ? selection.group.bbox
      : selection.part.bbox
    : null
  const selectForEdit = (p) =>
    setSelection(!p ? null : p.isGroup ? { kind: 'group', group: p } : { kind: 'part', part: p })
  const selectedId = selection ? (selection.kind === 'group' ? selection.group.id : selection.part.id) : null
  // parts of the current model (lifted from PartButtons) so a double-click on the
  // 3D model can resolve the clicked mesh → part → select + open its edit panel
  const partsRef = useRef([])
  const pickPartByName = (name) => {
    const part = partsRef.current.find((p) => p.name === name)
    if (!part) return
    selectForEdit(part)
    openPartEdit(part)
  }

  // persist the working model + version strip so an F5 doesn't wipe the history:
  // localStorage (instant, this browser) PLUS the server (durable — survives a
  // Library detour, restart, and re-login; keyed to the user + root model).
  useEffect(() => {
    const persistedVersions = modelVersions.filter((v) => persistable(v.modelUrl))
    try {
      if (!modelUrl) {
        // canvas explicitly cleared → drop the saved session
        localStorage.removeItem(SESSION_KEY)
        return
      }
      // a transient non-persistable URL (blob: upload preview) must NOT wipe the
      // saved history — just skip this save and keep the last good session
      if (!persistable(modelUrl)) return
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          modelUrl,
          modelVersions: persistedVersions,
          currentVersionId,
          versionSeq: versionSeq.current,
          baseModelPrompt,
          modelKind,
          // animation session (so re-animating survives F5 — no re-rig)
          rigTaskId,
          appliedClips,
          animEntries: animEntriesRef.current,
        }),
      )
    } catch {
      /* storage full / private mode — non-fatal */
    }
    // server sync (best-effort; ignore failures so the UI never blocks on it)
    if (persistedVersions.length) {
      const rootModelUrl = (persistedVersions.find((v) => !v.parentId) || persistedVersions[0])
        .modelUrl
      fetch('/api/versions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootModelUrl, versions: persistedVersions, currentVersionId }),
      }).catch(() => {})
    }
  }, [modelUrl, modelVersions, currentVersionId, baseModelPrompt, modelKind, rigTaskId, appliedClips])

  // model-dependent tools fall back to Generate when the canvas is cleared
  useEffect(() => {
    if (!modelUrl && (activeTab === 'edit' || activeTab === 'recolor')) setActiveTab('generate')
  }, [modelUrl, activeTab])

  // switch the on-screen model, and optionally record it as a version:
  //   version:{ as:'root' }  — start a fresh chain (a loaded/generated base)
  //   version:{ as:'child' } — append a child of the current version (an edit)
  //   (omitted)              — just switch (used when clicking a version card)
  const swapModel = (url, { isObjectUrl = false, version } = {}) => {
    const stale = objectUrlRef.current
    if (stale && stale !== url) {
      // defer revocation: the old viewer must unmount first (its `disposed`
      // flag then neutralizes loader callbacks), otherwise an in-flight load
      // of the revoked URL could error into the NEW viewer's status
      setTimeout(() => URL.revokeObjectURL(stale), 0)
      objectUrlRef.current = null
    }
    if (isObjectUrl) objectUrlRef.current = url
    // any model switch discards an unsaved upload preview (re-set by onFileChosen)
    // and closes the part-edit panel (its part ids belong to the old model)
    setActivePart(null)
    setSelection(null)
    setPendingFile(null)
    setPoints([])
    setSelectedIndex(null)
    setModelError(null)
    setModelStatus('loading')
    setModelUrl(url)
    setLoadKey((k) => k + 1)

    if (version?.as === 'root') {
      resetAnim() // a brand-new base model → its own (empty) animation session
      const id = `v${++versionSeq.current}`
      setModelVersions([{ id, modelUrl: url, label: version.label || 'Model', parentId: null, kind: version.kind }])
      setCurrentVersionId(id)
    } else if (version?.as === 'child') {
      const id = `v${++versionSeq.current}`
      const parentId = currentVersionIdRef.current
      setModelVersions((prev) => [
        ...prev,
        {
          id,
          modelUrl: url,
          label: version.label || 'Edit',
          parentId,
          kind: version.kind,
          // Task 6 — an animated version carries its rig so re-opening it adds
          // more clips for +10 (no re-rig). Non-anim edits leave these null.
          rigTaskId: version.rigTaskId ?? null,
          clips: version.clips ?? null,
          animEntries: version.animEntries ?? null,
        },
      ])
      setCurrentVersionId(id)
    }
  }

  // click a version card → load that model back without disturbing the others.
  // Restore that version's animation rig (if any) so an already-animated version
  // can add more clips for +10 instead of asking for a fresh skeleton.
  const loadVersion = (v) => {
    if (v.id === currentVersionIdRef.current) return
    setLastEditPrompt(null)
    setCurrentVersionId(v.id)
    setRigTaskId(v.rigTaskId || null)
    setAppliedClips(v.clips || [])
    animEntriesRef.current = v.animEntries || []
    swapModel(v.modelUrl) // no version option → history untouched
  }

  // Open a model AND restore its durable version tree from the server if one
  // exists (so returning to a model via the Library brings back its whole strip,
  // not a bare root). Falls back to starting a fresh root chain when there's no
  // saved history. Used by the Library-load path.
  const openModelWithHistory = async (url, { label, kind = null } = {}) => {
    resetAnim() // opening a different model from the Library → fresh animation session
    let tree = null
    try {
      const res = await fetch(`/api/versions?modelUrl=${encodeURIComponent(url)}`)
      if (res.ok) tree = (await res.json()).tree
    } catch {
      /* offline / no server — fall back to a fresh root */
    }
    if (tree?.versions?.length) {
      // restore the full strip; select the node matching the opened url
      const node = tree.versions.find((v) => v.modelUrl === url) || tree.versions[0]
      const maxSeq = tree.versions.reduce((m, v) => {
        const n = Number(String(v.id).replace(/^v/, ''))
        return Number.isFinite(n) && n > m ? n : m
      }, 0)
      versionSeq.current = Math.max(versionSeq.current, maxSeq)
      setModelVersions(tree.versions)
      setCurrentVersionId(node.id)
      swapModel(url) // plain switch — we set the strip ourselves
    } else {
      swapModel(url, { version: { as: 'root', label: label || 'Model', kind } })
    }
  }

  // ✕ on a version card → prune it (keep only the ones worth keeping, e.g. V1 +
  // the final). Deleting the loaded version falls back to the newest remaining.
  const deleteVersion = (v) => {
    const next = modelVersions.filter((x) => x.id !== v.id)
    setModelVersions(next)
    if (v.id === currentVersionId) {
      const fallback = next[next.length - 1]
      if (fallback) {
        setLastEditPrompt(null)
        setCurrentVersionId(fallback.id)
        swapModel(fallback.modelUrl)
      } else {
        setCurrentVersionId(null)
      }
    }
  }

  // LOCAL recolor: tint the live model in the viewer (free, instant, shape 1:1),
  // export the recoloured GLB, store it, and add it as a new child version — same
  // UX as the old paid path, but it actually changes the colour and costs nothing.
  const recolorScoped = async (parsed) => {
    const api = viewerApiRef.current
    if (!api?.exportModel) throw new Error('Load a model first')
    const sel = selection
    let label
    if (!sel) {
      // whole model — supports single tint AND colour-swap
      if (parsed.mode === 'swap') {
        if (!api.recolorSwap) throw new Error('Load a model first')
        api.recolorSwap(parsed.swaps)
      } else {
        if (!api.recolor) throw new Error('Load a model first')
        api.recolor(parsed.hex, parsed.finish)
      }
      label = parsed.label
    } else {
      // a part / group — single tint only (scoped per-mesh)
      if (parsed.mode === 'swap') {
        throw new Error('Colour-swap works on the whole model — pick a single colour for a part or group.')
      }
      if (!api.recolorParts) throw new Error('Load a model first')
      const names = sel.kind === 'group' ? sel.group.names : [sel.part.name]
      api.recolorParts(names, parsed.hex, parsed.finish)
      const scopeName = sel.kind === 'group' ? sel.group.name : sel.part.name
      label = `${scopeName}: ${parsed.label}`
    }
    const buf = await api.exportModel()
    // record=0 → version only, not in the Library (user sends it there explicitly)
    const res = await fetch(
      `/api/models/upload?record=0&name=${encodeURIComponent(`recolor-${label}`)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf },
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    setBaseModelPrompt(`Recolor: ${label}`)
    setLastEditPrompt(null)
    swapModel(data.url, { version: { as: 'child', label: `Recolor: ${label}` } })
  }

  // Task 6 — rig (once) + apply the selected animations, merge every clip into one
  // multi-clip GLB saved as a version. Only NEW clips are charged; the rig runs
  // only when there's no rigTaskId yet, and is stamped onto the version.
  const runAnimate = async (presets, progress) => {
    let rig = rigTaskId
    if (!rig) {
      progress?.('Adding skeleton…')
      const res = await fetch('/api/animate/rig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (data.mock) throw new Error('Mock mode — set TRIPO_API_KEY on the server for real rigging.')
      rig = data.rigTaskId
      setRigTaskId(rig)
      // stamp the rig onto the CURRENT (source) version too, so re-selecting it
      // later adds clips for +10 instead of asking for a fresh 25-cr skeleton
      const curId = currentVersionIdRef.current
      setModelVersions((prev) => prev.map((v) => (v.id === curId ? { ...v, rigTaskId: rig } : v)))
    }
    for (const preset of presets) {
      progress?.(`Animating: ${preset}…`)
      const res = await fetch('/api/animate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rigTaskId: rig, preset }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.modelUrl) throw new Error('Animation returned no model (missing TRIPO_API_KEY?)')
      animEntriesRef.current.push({ preset: data.preset || preset, url: data.modelUrl })
    }
    const entries = animEntriesRef.current
    let finalUrl = entries[0].url
    if (entries.length > 1) {
      progress?.('Combining clips…')
      const buf = await mergeAnimatedGlbs(entries)
      const up = await fetch('/api/models/upload?record=0&name=animated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf,
      })
      const ud = await up.json()
      if (!up.ok) throw new Error(ud.error || `HTTP ${up.status}`)
      finalUrl = ud.url
    }
    const names = entries.map((e) => e.preset.replace(/^preset:/, ''))
    setAppliedClips(names)
    setBaseModelPrompt(`Animated: ${names.join(', ')}`)
    setLastEditPrompt(null)
    swapModel(finalUrl, {
      version: {
        as: 'child',
        label: `Animation: ${names.join(' + ')}`,
        rigTaskId: rig,
        clips: names,
        animEntries: [...entries],
      },
    })
  }

  // download a specific version's GLB to the computer
  const downloadVersion = (v) => downloadModel(v.modelUrl, v.label || 'model-version')

  // "send to Library": re-store the version's GLB so it shows as a Library card
  const versionToLibrary = async (v) => {
    try {
      const got = await fetch(toLoadableUrl(v.modelUrl))
      if (!got.ok) throw new Error(`HTTP ${got.status}`)
      const blob = await got.blob()
      const name = (v.label || 'Model version').slice(0, 60)
      const up = await fetch(`/api/models/upload?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob,
      })
      if (!up.ok) throw new Error(`HTTP ${up.status}`)
      setHistoryKey((k) => k + 1) // refresh the Library to show the new card
    } catch (e) {
      setModelError(`Couldn't save to Library: ${e.message}`)
      setModelStatus('error')
    }
  }

  const editTask = useGenerationTask((url) => {
    // an edit result is a child of whatever version is currently loaded (branch)
    swapModel(url, { version: { as: 'child', label: pendingEditPromptRef.current || 'Spatial edit' } })
    setBaseModelPrompt(pendingEditPromptRef.current)
  })

  const busy = genBusy || editTask.generating
  const busySeenRef = useRef(false)
  useEffect(() => {
    if (!busySeenRef.current) {
      busySeenRef.current = true
      return
    }
    setHistoryKey((k) => k + 1)
  }, [busy])

  // stable per-point id so React keys by identity (not array index) — survives
  // removing a middle point without focus/value jumping between rows
  const pointIdRef = useRef(0)
  const justAddedRef = useRef(false)

  // a click on the mesh adds a point and opens its prompt editor right away
  const addPoint = (p) => {
    justAddedRef.current = true
    setActiveTab('edit') // clicking the model reveals the Spatial edit tool
    setPoints((prev) => [...prev, { ...p, id: pointIdRef.current++, prompt: '' }])
  }
  // select the new point once the add has committed (avoids reading a stale
  // points.length from the click closure)
  useEffect(() => {
    if (!justAddedRef.current) return
    justAddedRef.current = false
    setSelectedIndex(points.length - 1)
  }, [points])
  const removePoint = (i) => {
    setPoints((prev) => prev.filter((_, idx) => idx !== i))
    setSelectedIndex(null)
  }
  const setPointPrompt = (i, value) =>
    setPoints((prev) => prev.map((p, idx) => (idx === i ? { ...p, prompt: value } : p)))
  const clearPoints = () => {
    setPoints([])
    setSelectedIndex(null)
  }

  // at least one point with a prompt is required to edit
  const hasPrompts = points.some((p) => (p.prompt || '').trim())

  // the mode-independent edit payload: a representative centroid of the selected
  // points (for the M3 engine), the raw points, and a region-annotated
  // instruction composed from each point's own prompt
  const buildEditBase = () => {
    const n = points.length
    const centroid = points.reduce(
      (acc, p) => ({
        x: acc.x + p.point.x / n,
        y: acc.y + p.point.y / n,
        z: acc.z + p.point.z / n,
      }),
      { x: 0, y: 0, z: 0 },
    )
    const instruction = points
      .filter((p) => (p.prompt || '').trim())
      .map((p) => `${p.meshName}: ${p.prompt.trim()}`)
      .join('; ')
    return {
      instruction,
      point: centroid,
      points: points.map((p) => p.point),
      regionLabel: [...new Set(points.map((p) => p.meshName))].join(', '),
      baseModel: { prompt: baseModelPrompt, modelUrl },
    }
  }

  const sendEdit = async () => {
    if (!hasPrompts) return
    const data = await editTask.start('/api/edit', {
      ...buildEditBase(),
      mode: spatialGrounding ? 'spatial' : 'plain',
    })
    if (data) {
      pendingEditPromptRef.current = data.prompt
      setLastEditPrompt({ text: data.prompt, refinedBy: data.refinedBy })
    }
  }

  const startCompare = () => {
    if (!hasPrompts) return
    setCompare(buildEditBase())
  }

  // Hyper3D part-swap (mock): regenerate ONLY the part the points indicate —
  // the rest of the mesh stays byte-identical (vs Meshy re-rolling everything)
  const canPartSwap =
    points.length > 0 && /^\/(models|uploads|files)\//.test(modelUrl || '')
  const partSwap = async () => {
    if (!canPartSwap || swapBusy || busy) return
    setSwapBusy(true)
    setSwapMsg(null)
    setSwapErr(null)
    try {
      const base = buildEditBase()
      const res = await fetch('/api/edit/partswap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelUrl,
          point: base.point, // centroid of the selected points
          instruction: base.instruction,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSwapMsg(`Part “${data.swappedPart?.name}” regenerated${data.mock ? ' (mock)' : ''}`)
      setLastEditPrompt(null)
      swapModel(data.modelUrl, {
        version: { as: 'child', label: `Part: ${data.swappedPart?.name || 'region'}` },
      })
      setHistoryKey((k) => k + 1)
    } catch (e) {
      setSwapErr(e.message)
    } finally {
      setSwapBusy(false)
    }
  }

  // P4: clicking a part chip opens the part-edit panel (photo loop + stitch)
  const openPartEdit = (part) => {
    setHighlightBox(null)
    setActiveTab('edit') // surface the part-edit panel in the Edit tab
    setActivePart(part)
  }

  // Real Tripo semantic segmentation (~40 credits) — only Tripo-generated models
  // have a native task_id to segment; others get a clear "Tripo only" message.
  const segmentTripo = async (urlArg) => {
    const url = typeof urlArg === 'string' ? urlArg : modelUrl
    if (!url || segBusy) return
    setSegBusy(true)
    setSegMsg(null)
    try {
      const res = await fetch('/api/edit/segment-tripo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelUrl: url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSegMsg(`✓ Segmented into ${data.parts?.length ?? 0} parts`)
      setHistoryKey((k) => k + 1)
      swapModel(data.modelUrl, { version: { as: 'child', label: 'Segmented (Tripo)' } })
    } catch (e) {
      setSegMsg(e.message)
    } finally {
      setSegBusy(false)
    }
  }

  // upload = preview only (view-only object URL); History gets nothing until the
  // user explicitly clicks "Save to History" (keeps History uncluttered)
  const onFileChosen = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file
    if (!file) return
    setBaseModelPrompt(null)
    setModelKind(null)
    setLastEditPrompt(null)
    resetAnim()
    swapModel(URL.createObjectURL(file), { isObjectUrl: true }) // clears pendingFile
    setPendingFile(file) // mark as previewed-but-unsaved
  }

  // explicit save: store the previewed upload on the server + add to History
  const saveUpload = async () => {
    if (!pendingFile || saving) return
    setSaving(true)
    try {
      const name = pendingFile.name.replace(/\.glb$/i, '')
      const res = await fetch(`/api/models/upload?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pendingFile,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      swapModel(data.url, { version: { as: 'root', label: name || 'Upload' } })
      setHistoryKey((k) => k + 1) // refresh History to show the new card
    } catch (err) {
      setModelError(`Couldn't save the model: ${err.message}`)
      setModelStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const loadFromUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setUrlError('Enter an http(s) link to a .glb file')
      return
    }
    setUrlError(null)
    setBaseModelPrompt(null)
    setModelKind(null)
    setLastEditPrompt(null)
    swapModel(url, { version: { as: 'root', label: 'Loaded model' } })
  }

  // load the bundled demo model on demand (no longer auto-loaded)
  const loadSample = () => {
    setBaseModelPrompt(null)
    setModelKind(null)
    setLastEditPrompt(null)
    swapModel(SAMPLE_MODEL_URL, { version: { as: 'root', label: 'Sample model' } })
  }

  // return the canvas to its empty create-first state
  const clearModel = () => {
    const stale = objectUrlRef.current
    if (stale) {
      setTimeout(() => URL.revokeObjectURL(stale), 0)
      objectUrlRef.current = null
    }
    setPendingFile(null)
    setPoints([])
    setSelectedIndex(null)
    setModelError(null)
    setBaseModelPrompt(null)
    setModelKind(null)
    setLastEditPrompt(null)
    setModelStatus('idle')
    setModelUrl(null)
    setLoadKey((k) => k + 1)
    setModelVersions([])
    setCurrentVersionId(null)
  }

  return (
    <main className="app-main forge">
      {/* LEFT NAV RAIL — activity bar: Generate · Model · Edit · Recolor */}
      <nav className={`forge-nav ${navCollapsed ? 'forge-nav--collapsed' : ''}`} aria-label="Forge tools">
        {NAV_TABS.map((t) => {
          const locked = t.needsModel && !modelUrl
          return (
            <button
              key={t.id}
              type="button"
              className={`forge-nav-item ${activeTab === t.id && !navCollapsed ? 'active' : ''}`}
              onClick={() => {
                // clicking the open tab collapses the panel; any other tab opens it
                if (activeTab === t.id) setNavCollapsed((c) => !c)
                else {
                  setActiveTab(t.id)
                  setNavCollapsed(false)
                }
              }}
              disabled={locked}
              aria-current={activeTab === t.id ? 'page' : undefined}
              title={locked ? `${t.label} — generate or load a model first` : t.label}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          className="forge-nav-collapse"
          onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-label={navCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!navCollapsed}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </button>
      </nav>

      {/* LEFT PANEL — shows only the active tool */}
      <aside className={`sidebar forge-panel ${navCollapsed ? 'forge-panel--collapsed' : ''}`}>
        <div className="tab-pane" style={{ display: activeTab === 'generate' ? 'flex' : 'none' }}>
        <GeneratePanel
          disabled={editTask.generating}
          initialMode={['image', 'imagine'].includes(searchParams.get('mode')) ? searchParams.get('mode') : 'text'}
          initialPrompt={searchParams.get('prompt') || ''}
          initialImageId={searchParams.get('imageId') || null}
          initialEngine={searchParams.get('engine') === 'tripo' ? 'tripo' : 'meshy'}
          initialTextured={searchParams.get('textured') === '1'}
          autostart={searchParams.get('autostart') === '1'}
          onGeneratingChange={setGenBusy}
          onModelReady={(url, prompt, kind, opts) => {
            setBaseModelPrompt(prompt)
            setModelKind(kind || null)
            setLastEditPrompt(null)
            swapModel(url, { version: { as: 'root', label: prompt || 'Generated', kind } })
            // "Segment on create" (Tripo) → auto-run segmentation on the fresh model
            if (opts?.segment) segmentTripo(url)
          }}
        />
        </div>

        <div className="tab-pane" style={{ display: activeTab === 'model' ? 'flex' : 'none' }}>
        <div className="tool-block">
          <span className="tool-label">Open a model</span>
          <label className="upload-card">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <strong>Upload a .glb</strong>
            <span>click to choose a file</span>
            <input type="file" accept=".glb" hidden onChange={onFileChosen} />
          </label>
          {pendingFile && (
            <div className="pending-save">
              <span className="hint">Previewing “{pendingFile.name}” — not saved yet.</span>
              <button className="tool-cta tool-cta--sm" onClick={saveUpload} disabled={saving}>
                {saving ? 'Saving…' : 'Save to History'}
              </button>
            </div>
          )}
          <div className="url-load">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value)
                setUrlError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && loadFromUrl()}
              placeholder="…or paste a .glb URL"
            />
            <button className="mini-btn" onClick={loadFromUrl} disabled={!urlInput.trim()}>
              Load
            </button>
          </div>
          {urlError && <span className="url-error">{urlError}</span>}
          {modelUrl !== SAMPLE_MODEL_URL && (
            <button type="button" className="seed seed--wide" onClick={loadSample}>
              🎲 Try a sample model
            </button>
          )}
        </div>

        {modelUrl && (
          <div className="tool-block">
            <span className="tool-label">This model</span>
            <button
              className="tool-cta tool-cta--sm"
              onClick={segmentTripo}
              disabled={segBusy}
              title="Real semantic segmentation via Tripo (~40 credits) — Tripo-generated models only"
            >
              {segBusy ? 'Segmenting…' : 'Segment into parts'}
            </button>
            {segMsg && <span className="hint">{segMsg}</span>}
            <button
              className="tool-cta tool-cta--sm"
              onClick={() => setShowAnimate(true)}
              title="Rig the model and add animations (walk / run / jump…) — Tripo biped models"
            >
              🎬 Animate{appliedClips.length ? ` (${appliedClips.length})` : ''}
            </button>
            <button type="button" className="ghost-button" onClick={clearModel}>
              ✕ Clear canvas
            </button>
          </div>
        )}
        </div>

        <div className="tab-pane" style={{ display: activeTab === 'edit' ? 'flex' : 'none' }}>
        {modelUrl ? (
        <>
        <section className="panel spatial-panel">
          <span className="tool-label">Spatial edit</span>
          <div className="field">
            <label>Selected points ({points.length})</label>
            {points.length === 0 ? (
              <p className="spatial-tip">👆 Click the model, then describe the change.</p>
            ) : (
              <div className="point-list">
                {points.map((p, i) => (
                  <div
                    className={`point-item ${i === selectedIndex ? 'active' : ''}`}
                    key={p.id}
                  >
                    <div className="point-item-head">
                      <button
                        type="button"
                        className="point-badge"
                        onClick={() => setSelectedIndex(i === selectedIndex ? null : i)}
                        title="Focus this point on the model"
                      >
                        {i + 1}
                      </button>
                      <span className="point-region" title={p.meshName}>
                        {p.meshName}
                      </span>
                      <button
                        className="point-remove"
                        onClick={() => removePoint(i)}
                        aria-label="Remove point"
                        title="Remove point"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="input-with-mic">
                      <textarea
                        className="point-prompt"
                        value={p.prompt || ''}
                        onChange={(e) => setPointPrompt(i, e.target.value)}
                        onFocus={() => setSelectedIndex(i)}
                        placeholder={`Prompt for point ${i + 1} — e.g. "make this finger longer"`}
                        rows={2}
                      />
                      <MicButton
                        onTranscript={(text) => {
                          const cur = p.prompt || ''
                          setPointPrompt(i, cur.trim() ? `${cur.trim()} ${text}` : text)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {points.length > 0 && (
              <button className="link-button" onClick={clearPoints}>
                Clear all points
              </button>
            )}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={spatialGrounding}
              onChange={(e) => setSpatialGrounding(e.target.checked)}
            />
            Spatial grounding{' '}
            <span className="hint">
              ({spatialGrounding ? 'clicks + region' : 'plain instruction'})
            </span>
          </label>
          <button
            className="submit"
            onClick={sendEdit}
            disabled={!hasPrompts || editTask.generating || genBusy}
          >
            {editTask.generating
              ? `Applying edit… ${editTask.task.progress}%`
              : 'Send edit'}
          </button>
          {editTask.generating && (
            <div className="progress" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${editTask.task.progress}%` }}
              />
            </div>
          )}
          {editTask.generating && editTask.task.mock && (
            <span className="hint">
              mock mode — set MESHY_API_KEY on the server for real generation
            </span>
          )}
          {editTask.error && <span className="url-error">{editTask.error}</span>}
          {lastEditPrompt && (
            <div className="field">
              <label>Prompt sent ({lastEditPrompt.refinedBy})</label>
              <code className="prompt-preview">{lastEditPrompt.text}</code>
            </div>
          )}
        </section>
        {/* display-mode + shape/paint tools + brightness portal in here from ModelViewer */}
        <div className="edit-manual-host" ref={setManualHost} />
        <PartButtons
          modelUrl={modelUrl}
          busy={swapBusy || busy}
          selectedId={selectedId}
          onParts={(parts) => (partsRef.current = parts)}
          onHoverPart={setHighlightBox}
          onPickPart={(p) => {
            // click a part/group chip → select it (recolor scope + glow) AND open
            // its photo/edit panel on the left (Edit tab). Re-click closes it.
            selectForEdit(p)
            if (p) openPartEdit(p)
            else setActivePart(null)
          }}
        />
        <PhotoEditPanel
            modelUrl={modelUrl}
            onModelReady3D={(url, label) => {
              setBaseModelPrompt(label)
              setModelKind(null)
              setLastEditPrompt(null)
              swapModel(url, { version: { as: 'child', label } })
            }}
          />
        {activePart && (
          <PartEditPanel
            key={activePart.id}
            modelUrl={modelUrl}
            part={activePart}
            onClose={() => setActivePart(null)}
            onStitched={(url, label) => {
              setBaseModelPrompt(label)
              setModelKind(null)
              setLastEditPrompt(null)
              setHistoryKey((k) => k + 1)
              swapModel(url, { version: { as: 'child', label } }) // also closes the panel
            }}
          />
        )}
        </>
        ) : (
          <p className="pane-empty">
            Generate or load a model first — then click any part of it to reshape, photo-edit, or swap that region.
          </p>
        )}
        </div>

        <div className="tab-pane" style={{ display: activeTab === 'recolor' ? 'flex' : 'none' }}>
        {modelUrl ? (
          <RecolorPanel onRecolor={recolorScoped} scope={selection} />
        ) : (
          <p className="pane-empty">Load or generate a model to recolor it.</p>
        )}
        </div>
      </aside>

      {showAnimate && modelUrl && (
        <AnimatePanel
          modelUrl={modelUrl}
          rigTaskId={rigTaskId}
          appliedClips={appliedClips}
          onAnimate={runAnimate}
          onClose={() => setShowAnimate(false)}
        />
      )}

      {/* CENTER — canvas, or the create-first surface when empty */}
      <div className="viewer-wrap">
        {compare ? (
          <CompareView params={compare} onClose={() => setCompare(null)} />
        ) : modelUrl ? (
          <>
            {modelStatus === 'loading' && <div className="viewer-overlay">Loading model…</div>}
            {modelStatus === 'error' && (
              <div className="viewer-overlay viewer-overlay-error">{modelError}</div>
            )}
            <ModelViewer
              key={`${modelUrl}#${loadKey}`}
              modelUrl={modelUrl}
              apiOut={viewerApiRef}
              points={points}
              onAddPoint={addPoint}
              selectedIndex={selectedIndex}
              onSelectPoint={setSelectedIndex}
              onPromptChange={setPointPrompt}
              onLoaded={() => setModelStatus('ready')}
              onError={(message) => {
                setModelError(message)
                setModelStatus('error')
              }}
              onExportModel={async (buf) => {
                // manual paint/sculpt/kitbash edits → stored model → new child version.
                // record=0: version-only, not auto-added to the Library.
                const res = await fetch('/api/models/upload?record=0&name=manual-edit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/octet-stream' },
                  body: buf,
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setBaseModelPrompt('Manual edit')
                setLastEditPrompt(null)
                swapModel(data.url, { version: { as: 'child', label: 'Manual edit' } })
              }}
              onRevertEdits={() => {
                // discard unsaved manual edits by remounting the viewer on the
                // same model (key includes loadKey) — a clean reload
                setModelStatus('loading')
                setLoadKey((k) => k + 1)
              }}
              highlightBox={highlightBox || selectionBox}
              highlightNames={
                selection ? (selection.kind === 'group' ? selection.group.names : [selection.part.name]) : null
              }
              manualHost={manualHost}
              spatialClick={false} // no click-to-prompt popup for now (distracting)
              onPickPartAt={pickPartByName} // double-click a part → select + open edit
            />
            <ModelVersionStrip
              versions={modelVersions}
              currentId={currentVersionId}
              onSelect={loadVersion}
              onDelete={deleteVersion}
              onDownload={downloadVersion}
              onToLibrary={versionToLibrary}
            />
          </>
        ) : busy ? (
          <div className="forge-empty">
            <div className="forge-empty-spinner" />
            <h2>Forging your model…</h2>
            <p>Hang tight — this runs in the panel on the left.</p>
          </div>
        ) : (
          <div className="forge-empty">
            <div className="forge-empty-glyph">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" strokeLinejoin="round" />
                <path d="M3 7l9 4.5L21 7M12 11.5V21.5" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>Your model appears here</h2>
            <p>
              Describe it or drop an image in the panel on the left, then hit{' '}
              <span className="forge-empty-accent">Generate</span>.
            </p>
            <button className="ghost-button" onClick={loadSample}>
              Load a sample model
            </button>
          </div>
        )}
      </div>

      {/* RIGHT — library + publish */}
      <aside className={`sidebar forge-library ${libCollapsed ? 'forge-library--collapsed' : ''}`}>
        <button
          type="button"
          className="lib-collapse"
          onClick={() => setLibCollapsed(true)}
          title="Hide this panel"
          aria-label="Hide this panel"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 6l6 6-6 6" />
          </svg>
        </button>
        {modelUrl && (
          <PublishPanel modelUrl={modelUrl} description={baseModelPrompt} kind={modelKind} />
        )}
        <LibraryPanel
          refreshKey={historyKey}
          busy={busy}
          onLoad={(entry) => {
            setBaseModelPrompt(entry.prompt ?? null)
            // library entries label image runs as "image → 3D" — recover the kind
            const kind = entry.prompt === 'image → 3D' ? 'image' : entry.prompt ? 'text' : null
            setModelKind(kind)
            setLastEditPrompt(null)
            // restore this model's saved version tree if it has one, else fresh root
            openModelWithHistory(entry.modelUrl, { label: entry.prompt || 'Library model', kind })
          }}
        />
      </aside>
      {libCollapsed && (
        <button
          type="button"
          className="lib-reopen"
          onClick={() => setLibCollapsed(false)}
          title="Show library"
          aria-label="Show library"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </button>
      )}
    </main>
  )
}
