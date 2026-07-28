import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import MicButton from './MicButton.jsx'
import { toLoadableUrl } from '../lib/modelUrl.js'

const MARKER_COLOR = 0xff2d9b // hot magenta — matches the selection accent
const BASE_EXPOSURE = 1.1 // tone-mapping exposure at brightness 1.0 (slider multiplies it)
// vivid per-part palette for the "Parts" display mode (Tripo-Studio style: each
// segmented mesh gets its own flat colour so parts read at a glance)
const PART_PALETTE = [
  0xff4d4d, 0x4dff4d, 0x4d7fff, 0xffd24d, 0xb84dff, 0x22d3ee,
  0xff8a4d, 0xff4dd2, 0x9dff4d, 0x4dffa0, 0xff6b6b, 0x6b8cff,
]

/**
 * Browser 3D viewer: loads a GLB/glTF model, orbit controls, and raycast click
 * selection. Each click on the mesh adds a point (onAddPoint); the parent owns
 * the list of points and passes it back as `points`, drawn as amber markers.
 *
 * Each point carries its own prompt. The viewer overlays a numbered label on
 * every marker; clicking a label selects that point (onSelectPoint) and opens an
 * inline editor for its prompt (onPromptChange) — the same prompt is also edited
 * in the sidebar, so the two stay in sync.
 *
 * Props:
 *   modelUrl       — URL (or object URL) of the GLB to display
 *   points         — [{ point:{x,y,z}, meshName, prompt }] markers (source of truth)
 *   onAddPoint     — called with { point, meshName } when the user clicks the mesh
 *   selectedIndex  — index of the point whose inline editor is open (or null)
 *   onSelectPoint  — called with an index (or null) when a label is clicked / closed
 *   onPromptChange — called with (index, value) as the inline editor is typed in
 *   onLoaded / onError — load lifecycle
 *   showcase       — landing/post hero: auto-rotate, no toolbar, no point UI
 */
export default function ModelViewer({
  modelUrl,
  points,
  onAddPoint,
  selectedIndex = null,
  onSelectPoint,
  onPromptChange,
  onLoaded,
  onError,
  onExportModel,
  onRevertEdits,
  apiOut,
  highlightBox = null,
  highlightNames = null,
  showcase = false,
  manualHost = null, // DOM node in the Edit tab where the manual tools render
  spatialClick = true, // single-click adds a spatial-edit point (+popup); off = no popup
  onPickPartAt = null, // double-click a part → report its mesh name (part selection)
  markMode = false, // seed-marking: single-click drops a segmentation seed (no popup)
  marks = [], // [{ label, point:{x,y,z} }] seed markers to render
  onAddMark = null, // called with { x, y, z } when the user clicks in mark mode
}) {
  const containerRef = useRef(null)
  // keep latest callbacks/points without re-creating the whole scene on re-render
  const callbacksRef = useRef({})
  callbacksRef.current = { onAddPoint, onSelectPoint, onLoaded, onError, onPickPartAt, onAddMark }
  const spatialClickRef = useRef(true)
  spatialClickRef.current = spatialClick
  const markModeRef = useRef(false)
  markModeRef.current = markMode
  const pointsRef = useRef(points)
  pointsRef.current = points
  const marksRef = useRef(marks)
  marksRef.current = marks
  // imperative handles the toolbar + points effect reach into the live scene
  const apiRef = useRef({})
  const [autoRotate, setAutoRotate] = useState(showcase)
  // viewer brightness: multiplies the renderer's tone-mapping exposure so darker
  // Meshy/Tripo models can be lit up without re-generating (kept in a ref so a
  // model swap re-applies the current value at mount)
  const [brightness, setBrightness] = useState(1)
  const brightnessRef = useRef(1)
  brightnessRef.current = brightness
  // "explode" the parts apart to reveal structure (Tripo-style), toolbar toggle
  const [exploded, setExploded] = useState(false)
  // P5/P6 manual edit tools: paint (texture brush), sculpt (inflate/dent),
  // place (kitbash a prebuilt part). Values mirrored into refs so the pointer
  // handlers (bound once per model) always read the current setting.
  const [tool, setTool] = useState(null) // null | 'paint' | 'sculpt' | 'place' | 'move'
  // #5 move tool: gizmo mode for transforming a selected part
  const [gizmoMode, setGizmoMode] = useState('rotate') // 'translate' | 'rotate' | 'scale'
  const gizmoModeRef = useRef('rotate')
  gizmoModeRef.current = gizmoMode
  // Task 6: animation clips carried by a rigged/animated GLB, + which one plays.
  // Populated from gltf.animations on load; the bottom switcher swaps between them.
  const [clips, setClips] = useState([])
  const [activeClip, setActiveClip] = useState(null)
  const [paintColor, setPaintColor] = useState('#e64545')
  const [brushSize, setBrushSize] = useState(0.5)
  const [sculptDir, setSculptDir] = useState(1) // +1 inflate, -1 dent
  const [preset, setPreset] = useState('horn')
  const [dirty, setDirty] = useState(false) // unsaved manual edits exist
  const [savingEdits, setSavingEdits] = useState(false)
  const [toolError, setToolError] = useState(null)
  // brush ring that follows the pointer over the canvas so the paint/sculpt area
  // is visible (hidden over the UI panels so their buttons stay clickable)
  const [brushCursor, setBrushCursor] = useState(null) // { x, y } in canvas px, or null
  const toolRef = useRef(null)
  toolRef.current = tool
  const colorRef = useRef(paintColor)
  colorRef.current = paintColor
  const sizeRef = useRef(brushSize)
  sizeRef.current = brushSize
  const dirRef = useRef(sculptDir)
  dirRef.current = sculptDir
  const presetRef = useRef(preset)
  presetRef.current = preset
  const setDirtyRef = useRef(() => {})
  setDirtyRef.current = () => setDirty(true)
  // display mode + mesh stats for the viewer toolbar/badge
  const [mode, setMode] = useState('shaded') // shaded | solid | wireframe
  const [stats, setStats] = useState(null) // { faces, vertices }
  const modeRef = useRef('shaded')
  modeRef.current = mode
  // projected screen position of every marker, for the HTML label overlay
  const [labels, setLabels] = useState([]) // [{ x, y, visible }]
  const popupRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    // guards async loader callbacks that may fire after unmount/model swap
    let disposed = false

    const disposeObject = (root) => {
      root.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((m) => {
          if (!m) return
          Object.values(m).forEach((v) => v?.isTexture && v.dispose())
          m.dispose()
        })
      })
    }

    const scene = new THREE.Scene()
    // transparent: the model floats on the page's forge-grid backdrop (CSS)

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      100,
    )
    camera.position.set(0.6, 0.4, 0.8)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = BASE_EXPOSURE * brightnessRef.current
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotateSpeed = 1.6
    controls.autoRotate = autoRotate

    // #5 move tool: a transform gizmo to move / rotate / scale a selected part
    // directly in 3D (real geometry — textures & shape kept). Only active while
    // the "Move" tool is on; edits are saved via the normal export→version path.
    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode('rotate')
    transform.setSpace('local')
    const gizmo = transform.getHelper ? transform.getHelper() : transform
    scene.add(gizmo)
    transform.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value // don't orbit while dragging the gizmo
    })
    transform.addEventListener('objectChange', () => setDirtyRef.current())

    // three-point lighting: cool sky/ground ambient + warm key + steel rim, plus
    // a soft fill so very dark models (e.g. matte-black recolors) never go to a
    // pure-black void. The brightness slider scales overall exposure on top.
    scene.add(new THREE.HemisphereLight(0x8fb4d6, 0x1a1208, 0.95))
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.4)
    keyLight.position.set(3, 5, 2)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.7)
    fillLight.position.set(-2, 1, 4)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.9)
    rimLight.position.set(-3, 2, -4)
    scene.add(rimLight)

    // markers are drawn from the `points` prop; small spheres sharing one
    // geometry + material, recreated whenever the point list changes
    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    const markerMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR })
    let markerGeom = new THREE.SphereGeometry(0.01, 16, 16)

    // seed marks (manual segmentation) — a separate, brighter set so they read
    // distinctly from spatial-edit points; each is coloured by its part palette
    const marksGroup = new THREE.Group()
    scene.add(marksGroup)
    let markSeedGeom = new THREE.SphereGeometry(0.018, 16, 16)
    const syncMarks = (list) => {
      marksGroup.clear()
      ;(list || []).forEach((mk, i) => {
        const mat = new THREE.MeshBasicMaterial({ color: PART_PALETTE[i % PART_PALETTE.length] })
        const dot = new THREE.Mesh(markSeedGeom, mat)
        dot.position.set(mk.point.x, mk.point.y, mk.point.z)
        marksGroup.add(dot)
      })
    }

    // display-mode override materials (Meshy-style solid / wireframe views).
    // Each mesh keeps its original material in userData.origMat for "shaded".
    const solidMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.1, roughness: 0.78 })
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true })
    const applyDisplayMode = (m) => {
      if (!model) return
      let idx = 0
      model.traverse((o) => {
        if (!o.isMesh) return
        // meshes added AFTER load (kitbash parts) never got an origMat at load
        // time — capture it lazily so "Shaded" can restore them instead of
        // blanking their material (which made placed parts vanish)
        if (!o.userData.origMat) o.userData.origMat = o.material
        if (m === 'parts') {
          // one flat colour per mesh (segmented parts read distinctly), cached
          if (!o.userData.partsMat) {
            o.userData.partsMat = new THREE.MeshStandardMaterial({
              color: PART_PALETTE[idx % PART_PALETTE.length],
              metalness: 0.05,
              roughness: 0.8,
            })
          }
          o.material = o.userData.partsMat
        } else {
          o.material = m === 'wireframe' ? wireMat : m === 'solid' ? solidMat : o.userData.origMat
        }
        idx++
      })
    }

    const syncMarkers = (pts) => {
      markersGroup.clear() // children share geom+mat, disposed once at teardown
      pts.forEach((p) => {
        const dot = new THREE.Mesh(markerGeom, markerMat)
        dot.position.set(p.point.x, p.point.y, p.point.z)
        markersGroup.add(dot)
      })
    }

    // project every marker to 2D screen space for the HTML label overlay
    const v = new THREE.Vector3()
    const updateLabels = () => {
      if (showcase) return
      const w = container.clientWidth
      const h = container.clientHeight
      const next = pointsRef.current.map((p) => {
        v.set(p.point.x, p.point.y, p.point.z).project(camera)
        const x = (v.x * 0.5 + 0.5) * w
        const y = (-v.y * 0.5 + 0.5) * h
        // in front of the camera AND within the canvas — don't draw labels that
        // would land on the toolbar/sidebar when a point is panned off-screen
        return { x, y, visible: v.z < 1 && x >= 0 && x <= w && y >= 0 && y <= h }
      })
      setLabels(next)
    }

    // walk up the hierarchy until a named node is found — generated GLBs often
    // name groups rather than leaf meshes. Stop at the model root: exporters
    // name it "Scene", which is useless as a region label.
    const regionLabel = (object) => {
      let node = object
      while (node && node !== model && !node.name) node = node.parent
      if (!node || node === model) return 'unnamed region'
      return node.name
    }

    let homePosition = null
    // model center (in the GLB's own coords) — part bboxes/segments are in that
    // space, but the model is shifted by -center for display, so highlights/explode
    // apply the same shift
    const modelCenter = new THREE.Vector3()
    let highlightHelper = null
    const explodeParts = [] // { mesh, origPos:Vector3, dir:Vector3 }
    // P5/P6 manual-edit state (per loaded model)
    let modelSize = 1 // world diagonal, set by the loader — scales brushes/parts
    const placedParts = [] // kitbash meshes, newest last (for undo)
    const sculptedMeshes = new Set() // normals recomputed at stroke end

    // draw a wireframe box over a part's bbox (from segmentation), or clear it
    const setHighlight = (box) => {
      if (highlightHelper) {
        scene.remove(highlightHelper)
        highlightHelper.geometry?.dispose()
        highlightHelper.material?.dispose()
        highlightHelper = null
      }
      if (!box?.min || !box?.max) return
      const b3 = new THREE.Box3(
        new THREE.Vector3(box.min[0], box.min[1], box.min[2]).sub(modelCenter),
        new THREE.Vector3(box.max[0], box.max[1], box.max[2]).sub(modelCenter),
      )
      highlightHelper = new THREE.Box3Helper(b3, MARKER_COLOR)
      scene.add(highlightHelper)
    }

    // push each mesh outward from the model center to reveal the parts, or restore
    const setExploded = (on) => {
      for (const p of explodeParts) {
        p.mesh.position.copy(on ? p.origPos.clone().addScaledVector(p.dir, 0.6) : p.origPos)
      }
    }

    // Task 6 — animation playback. A rigged/animated GLB (from Tripo) carries
    // clips; drive them with an AnimationMixer and let the bottom switcher pick.
    let mixer = null
    const animClock = new THREE.Clock()
    const clipActions = {} // display name -> AnimationAction
    const playClip = (name) => {
      const next = clipActions[name]
      if (!next) return
      for (const [n, a] of Object.entries(clipActions)) if (n !== name) a.fadeOut(0.25)
      next.reset().setEffectiveWeight(1).fadeIn(0.25).play()
      setActiveClip(name)
    }

    apiRef.current = {
      controls,
      syncMarkers,
      syncMarks,
      updateLabels,
      playClip,
      getClips: () => Object.keys(clipActions),
      resetView: () => {
        if (!homePosition) return
        camera.position.copy(homePosition)
        controls.target.set(0, 0, 0)
        controls.update()
      },
      setDisplayMode: applyDisplayMode,
      setExposure: (mult) => {
        renderer.toneMappingExposure = BASE_EXPOSURE * mult
      },
      setHighlight,
      // Task 8 — glow the SELECTED part/group meshes (by name) so the current
      // scope is unmistakable, instead of relying only on the bbox outline (which
      // visually passes through neighbours). Others get emissive back to black.
      setPartHighlight: (names) => {
        if (!model) return
        const set = names?.length ? new Set(names) : null
        model.traverse((o) => {
          if (!o.isMesh) return
          const on = set && (set.has(o.name) || set.has(o.parent?.name))
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m?.emissive) {
              m.emissive.setHex(on ? 0x0a3a4a : 0x000000)
              m.needsUpdate = true
            }
          }
        })
      },
      setExploded,
      // serialize the (edited) model back to a GLB — manual edits become a new version
      exportModel: () =>
        new Promise((resolve, reject) => {
          if (!model) return reject(new Error('no model loaded'))
          new GLTFExporter().parse(model, resolve, reject, { binary: true })
        }),
      // LOCAL recolor (free, instant, shape untouched): set the base colour on
      // every material and adjust the PBR finish. Keeps the texture map so panel
      // detail survives — colour multiplies the map, so e.g. black reads black.
      // Updates userData.origMat so display-mode toggles keep the new colour.
      recolor: (hex, finish) => {
        if (!model) return
        const col = new THREE.Color(hex)
        model.traverse((o) => {
          if (!o.isMesh) return
          const base = o.userData.origMat || o.material
          const mats = (Array.isArray(base) ? base : [base]).map((m) => {
            const nm = m.clone()
            if (nm.color) nm.color.copy(col)
            if (finish === 'matte') { nm.roughness = 0.9; nm.metalness = 0.0 }
            else if (finish === 'metal') { nm.roughness = 0.25; nm.metalness = 0.9 }
            else if (finish === 'glossy') { nm.roughness = 0.15; nm.metalness = 0.1 }
            nm.needsUpdate = true
            return nm
          })
          const applied = Array.isArray(base) ? mats : mats[0]
          o.userData.origMat = applied
          // reflect immediately unless a non-shaded overlay (solid/wire) is active
          if (modeRef.current === 'shaded' || modeRef.current === 'parts') o.material = applied
        })
      },
      // Task 8 — recolor ONLY the meshes of a grouped region (e.g. a whole arm
      // that segmentation split into 3-4 parts), matched by node/mesh name. Same
      // material logic as recolor, gated to the group's names — so "make the whole
      // arm black/metal" hits every piece at once, free, with the rest untouched.
      recolorParts: (names, hex, finish) => {
        if (!model || !names?.length) return
        const set = new Set(names)
        const col = new THREE.Color(hex)
        model.traverse((o) => {
          if (!o.isMesh) return
          if (!(set.has(o.name) || set.has(o.parent?.name))) return
          const base = o.userData.origMat || o.material
          const mats = (Array.isArray(base) ? base : [base]).map((m) => {
            const nm = m.clone()
            if (nm.color) nm.color.copy(col)
            if (finish === 'matte') { nm.roughness = 0.9; nm.metalness = 0.0 }
            else if (finish === 'metal') { nm.roughness = 0.25; nm.metalness = 0.9 }
            else if (finish === 'glossy') { nm.roughness = 0.15; nm.metalness = 0.1 }
            nm.needsUpdate = true
            return nm
          })
          const applied = Array.isArray(base) ? mats : mats[0]
          o.userData.origMat = applied
          if (modeRef.current === 'shaded' || modeRef.current === 'parts') o.material = applied
        })
      },
      // SWAP recolor: remap ONLY the given source colours to targets, per-texel,
      // leaving everything else untouched — so "white→black, blue→red" turns a
      // white-with-blue-lines model black-with-red-lines. Matching keeps each
      // pixel's own brightness (k) so panel shading survives the swap. Falls back
      // to the flat material.color for untextured meshes.
      recolorSwap: (swaps) => {
        if (!model || !swaps?.length) return
        const S = swaps.map((s) => ({ from: new THREE.Color(s.from), to: new THREE.Color(s.to) }))
        const T2 = 0.10 // squared colour-distance threshold for "is this that colour?"
        const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b
        model.traverse((o) => {
          if (!o.isMesh) return
          const base = o.userData.origMat || o.material
          const mats = (Array.isArray(base) ? base : [base]).map((m) => {
            const nm = m.clone()
            const img = nm.map?.image
            if (img && (img.width || img.videoWidth)) {
              const w = img.width || img.videoWidth
              const h = img.height || img.videoHeight
              const cv = document.createElement('canvas')
              cv.width = w
              cv.height = h
              const ctx = cv.getContext('2d', { willReadFrequently: true })
              ctx.drawImage(img, 0, 0, w, h)
              const px = ctx.getImageData(0, 0, w, h)
              const d = px.data
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
                for (const s of S) {
                  const dr = r - s.from.r, dg = g - s.from.g, db = b - s.from.b
                  if (dr * dr + dg * dg + db * db < T2) {
                    const sl = lum(s.from.r, s.from.g, s.from.b) || 0.001
                    const k = Math.min(1.7, lum(r, g, b) / sl) // keep the pixel's shading
                    d[i] = Math.min(255, s.to.r * 255 * k)
                    d[i + 1] = Math.min(255, s.to.g * 255 * k)
                    d[i + 2] = Math.min(255, s.to.b * 255 * k)
                    break
                  }
                }
              }
              ctx.putImageData(px, 0, 0)
              const tex = new THREE.CanvasTexture(cv)
              tex.flipY = nm.map.flipY
              tex.colorSpace = nm.map.colorSpace
              tex.wrapS = nm.map.wrapS
              tex.wrapT = nm.map.wrapT
              nm.map = tex
            } else if (nm.color) {
              const c = nm.color
              for (const s of S) {
                const dr = c.r - s.from.r, dg = c.g - s.from.g, db = c.b - s.from.b
                if (dr * dr + dg * dg + db * db < T2) { nm.color.copy(s.to); break }
              }
            }
            nm.needsUpdate = true
            return nm
          })
          const applied = Array.isArray(base) ? mats : mats[0]
          o.userData.origMat = applied
          if (modeRef.current === 'shaded' || modeRef.current === 'parts') o.material = applied
        })
      },
      undoLastPart: () => {
        const part = placedParts.pop()
        if (!part) return placedParts.length
        part.parent?.remove(part)
        part.geometry.dispose()
        part.material.dispose()
        return placedParts.length
      },
      setGizmoMode: (m) => transform.setMode(m),
      detachTransform: () => transform.detach(),
    }
    // hand the imperative API to the parent (RecolorPanel calls recolor/exportModel)
    if (apiOut) apiOut.current = apiRef.current

    let model = null
    const loader = new GLTFLoader()
    loader.load(
      toLoadableUrl(modelUrl),
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene)
          return
        }
        model = gltf.scene
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3()).length()
        model.position.sub(center)
        modelCenter.copy(center)
        modelSize = size
        // record each mesh's outward direction (from center) for the explode toggle
        model.updateWorldMatrix(true, true)
        model.traverse((o) => {
          if (!o.isMesh) return
          const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
          const dir =
            c.lengthSq() > 1e-6 ? c.clone().normalize().multiplyScalar(size * 0.5) : new THREE.Vector3()
          explodeParts.push({ mesh: o, origPos: o.position.clone(), dir })
        })
        // Default view: a 3/4 FRONT shot so the model faces the camera (slightly
        // turned to the viewer's right), for Meshy and Tripo alike. Earlier we
        // flipped the camera behind Tripo models on the theory they export
        // back-to-front — but in practice that showed their BACK, so all engines
        // now use the same front position. Only the CAMERA moves (the mesh stays
        // put, so segment bboxes still line up).
        camera.position.set(size * 0.7, size * 0.5, size * 0.9)
        camera.near = size / 100
        camera.far = size * 10
        camera.updateProjectionMatrix()
        homePosition = camera.position.clone()

        // marker radius scaled to the model — small, not a giant blob
        markerGeom.dispose()
        markerGeom = new THREE.SphereGeometry(size * 0.006, 16, 16)
        // seed marks a touch larger so they stand out as deliberate labels
        markSeedGeom.dispose()
        markSeedGeom = new THREE.SphereGeometry(size * 0.012, 16, 16)

        const grid = new THREE.GridHelper(size * 1.6, 22, 0x22d3ee, 0x1c2740)
        grid.position.y = box.min.y - center.y
        grid.material.transparent = true
        grid.material.opacity = 0.3
        scene.add(grid)

        // remember each mesh's original material + tally topology stats
        let faces = 0
        let vertices = 0
        model.traverse((o) => {
          if (!o.isMesh || !o.geometry) return
          o.userData.origMat = o.material
          const g = o.geometry
          const vCount = g.attributes.position?.count || 0
          vertices += vCount
          faces += g.index ? g.index.count / 3 : vCount / 3
        })
        setStats({ faces: Math.round(faces), vertices })
        applyDisplayMode(modeRef.current)

        scene.add(model)
        // Task 6: wire up any animation clips the GLB carries (Tripo rig+retarget
        // bakes one clip per animation; names come through as "preset:walk").
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model)
          gltf.animations.forEach((clip, i) => {
            const nm = (clip.name || `clip ${i + 1}`).replace(/^preset:/, '')
            clipActions[nm] = mixer.clipAction(clip)
          })
          const names = Object.keys(clipActions)
          setClips(names)
          playClip(names[0])
        } else {
          setClips([])
          setActiveClip(null)
        }
        syncMarkers(pointsRef.current)
        syncMarks(marksRef.current)
        updateLabels()
        callbacksRef.current.onLoaded?.()
      },
      undefined,
      (err) => {
        if (disposed) return
        console.error(`Failed to load model ${modelUrl}:`, err)
        callbacksRef.current.onError?.(
          'Failed to load the model. Check that the file is a valid .glb and, ' +
            'for URLs, that the server allows cross-origin requests (CORS).',
        )
      },
    )

    // raycast click → add a point; drags (orbiting) are ignored
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt = null

    const onPointerDown = (e) => {
      downAt = { x: e.clientX, y: e.clientY }
    }

    const onPointerUp = (e) => {
      const wasDrag =
        !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5
      downAt = null
      if (wasDrag || !model) return
      if (toolRef.current) return // an edit tool owns clicks — no point-adding

      // seed-mark mode: a click drops a segmentation seed at the hit point and
      // takes precedence over the spatial-edit point (no popup)
      if (markModeRef.current) {
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObject(model, true)[0]
        if (hit) callbacksRef.current.onAddMark?.({ x: hit.point.x, y: hit.point.y, z: hit.point.z })
        return
      }
      if (!spatialClickRef.current) return // spatial click-to-prompt disabled

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(model, true)[0]
      if (hit) {
        callbacksRef.current.onAddPoint?.({
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          meshName: regionLabel(hit.object),
        })
      }
    }

    // double-click a part → report its mesh/node name so the parent selects that
    // part (and opens its edit panel). Single clicks stay free for orbit/drag.
    const onDoubleClick = (e) => {
      if (!model || toolRef.current) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(model, true)[0]
      const name = hit?.object?.name || hit?.object?.parent?.name
      if (name) callbacksRef.current.onPickPartAt?.(name)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('dblclick', onDoubleClick)
    // labels follow the model as the camera moves (orbit/zoom/pan)
    controls.addEventListener('change', updateLabels)

    // --- P5/P6 manual edit tools: paint / sculpt / place ---------------------

    const pick = (e) => {
      if (!model) return null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObject(model, true)[0] ?? null
    }

    // P5 paint: draw into a CanvasTexture copy of the mesh's texture at the hit
    // UV. Meshes without a texture get a canvas filled with their base color, so
    // painting over a decal (e.g. a gold skull) covers it exactly.
    const prepPaint = (mesh) => {
      if (mesh.userData.paintCtx) return
      const mat = (mesh.userData.origMat || mesh.material).clone()
      const img = mat.map?.image
      const canvas = document.createElement('canvas')
      canvas.width = img?.width || 1024
      canvas.height = img?.height || 1024
      const ctx = canvas.getContext('2d')
      if (img) {
        try {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        } catch {
          ctx.fillStyle = `#${mat.color.getHexString()}`
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
      } else {
        ctx.fillStyle = `#${mat.color.getHexString()}`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        mat.color.set('#ffffff') // color moved into the map — avoid double-tinting
      }
      const tex = new THREE.CanvasTexture(canvas)
      tex.flipY = mat.map ? mat.map.flipY : false // glTF textures are unflipped
      tex.colorSpace = THREE.SRGBColorSpace
      if (mat.map) {
        tex.wrapS = mat.map.wrapS
        tex.wrapT = mat.map.wrapT
      }
      mat.map = tex
      mat.needsUpdate = true
      mesh.material = mat
      mesh.userData.origMat = mat // display-mode toggles keep showing the paint
      mesh.userData.paintCtx = ctx
      mesh.userData.paintTex = tex
    }

    const paintAt = (hit) => {
      const mesh = hit.object
      if (!mesh.isMesh || !hit.uv) return
      prepPaint(mesh)
      const { paintCtx: ctx, paintTex: tex } = mesh.userData
      const w = ctx.canvas.width
      const h = ctx.canvas.height
      const y = (tex.flipY ? 1 - hit.uv.y : hit.uv.y) * h
      ctx.fillStyle = colorRef.current
      ctx.beginPath()
      ctx.arc(hit.uv.x * w, y, Math.max(2, sizeRef.current * 0.05 * w), 0, Math.PI * 2)
      ctx.fill()
      tex.needsUpdate = true
      setDirtyRef.current()
    }

    // P5 sculpt: displace vertices near the hit point along their normals
    // (inflate or dent); normals are recomputed once at stroke end.
    const sculptAt = (hit) => {
      const mesh = hit.object
      const pos = mesh.geometry?.attributes.position
      const nrm = mesh.geometry?.attributes.normal
      if (!pos || !nrm) return
      const local = mesh.worldToLocal(hit.point.clone())
      const meshScale = mesh.getWorldScale(new THREE.Vector3()).x || 1
      const radius = (modelSize * 0.05 * (0.3 + sizeRef.current)) / meshScale
      const strength = radius * 0.18 * dirRef.current
      const r2 = radius * radius
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - local.x
        const dy = pos.getY(i) - local.y
        const dz = pos.getZ(i) - local.z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > r2) continue
        const fall = 1 - Math.sqrt(d2) / radius
        pos.setXYZ(
          i,
          pos.getX(i) + nrm.getX(i) * strength * fall,
          pos.getY(i) + nrm.getY(i) * strength * fall,
          pos.getZ(i) + nrm.getZ(i) * strength * fall,
        )
      }
      pos.needsUpdate = true
      sculptedMeshes.add(mesh)
      setDirtyRef.current()
    }

    // P6 kitbash: drop a prebuilt part on the surface, oriented along the normal
    const PART_PRESETS = {
      horn: () => new THREE.ConeGeometry(0.35, 1.6, 20),
      spike: () => new THREE.ConeGeometry(0.18, 1.1, 10),
      ball: () => new THREE.SphereGeometry(0.5, 20, 16),
      fin: () => new THREE.BoxGeometry(1.4, 0.9, 0.08),
      plate: () => new THREE.CylinderGeometry(0.55, 0.55, 0.09, 24),
    }
    const placeAt = (hit) => {
      const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0)
      const geom = (PART_PRESETS[presetRef.current] || PART_PRESETS.horn)()
      const mat = new THREE.MeshStandardMaterial({
        color: colorRef.current,
        metalness: 0.1,
        roughness: 0.7,
      })
      const part = new THREE.Mesh(geom, mat)
      const s = modelSize * 0.12 * (0.35 + sizeRef.current)
      part.scale.setScalar(s)
      part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
      part.position.copy(hit.point).addScaledVector(normal, s * 0.45)
      part.userData.kitPart = true
      scene.add(part)
      model.attach(part) // reparent under the model so exports include it
      placedParts.push(part)
      setDirtyRef.current()
    }

    let stroking = false
    const onToolDown = (e) => {
      if (!toolRef.current || !model || e.button !== 0) return
      // Move tool: click a part to select it; the gizmo (its own handles) then
      // owns the drag. If the click landed on a gizmo handle, let it be.
      if (toolRef.current === 'move') {
        if (transform.axis || transform.dragging) return
        const hit = pick(e)
        if (hit?.object) {
          transform.attach(hit.object)
          transform.setMode(gizmoModeRef.current)
        }
        return
      }
      const hit = pick(e)
      if (!hit) return
      controls.enabled = false // the stroke owns the drag, not the orbit
      if (toolRef.current === 'place') {
        placeAt(hit)
        controls.enabled = true
        return
      }
      stroking = true
      if (toolRef.current === 'paint') paintAt(hit)
      else sculptAt(hit)
    }
    const onToolMove = (e) => {
      if (!stroking) return
      const hit = pick(e)
      if (!hit) return
      if (toolRef.current === 'paint') paintAt(hit)
      else if (toolRef.current === 'sculpt') sculptAt(hit)
    }
    const onToolUp = () => {
      if (!stroking) return
      stroking = false
      controls.enabled = true
      for (const m of sculptedMeshes) m.geometry.computeVertexNormals()
      sculptedMeshes.clear()
    }
    renderer.domElement.addEventListener('pointerdown', onToolDown)
    renderer.domElement.addEventListener('pointermove', onToolMove)
    window.addEventListener('pointerup', onToolUp)

    const onResize = () => {
      if (!container.clientWidth || !container.clientHeight) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      updateLabels()
    }
    // observe the container, not just the window — so the canvas also resizes
    // when the sidebar collapses/expands (no window resize event fires then)
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      controls.update()
      const dt = animClock.getDelta()
      if (mixer) mixer.update(dt)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      apiRef.current = {}
      if (apiOut) apiOut.current = {}
      mixer?.stopAllAction()
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('dblclick', onDoubleClick)
      renderer.domElement.removeEventListener('pointerdown', onToolDown)
      renderer.domElement.removeEventListener('pointermove', onToolMove)
      window.removeEventListener('pointerup', onToolUp)
      controls.removeEventListener('change', updateLabels)
      controls.dispose()
      transform.detach()
      transform.dispose()
      gizmo.removeFromParent?.()
      if (highlightHelper) {
        highlightHelper.geometry?.dispose()
        highlightHelper.material?.dispose()
      }
      if (model) model.traverse((o) => o.userData?.partsMat?.dispose())
      markersGroup.clear()
      markerGeom.dispose()
      markerMat.dispose()
      marksGroup.clear() // per-mark materials disposed via disposeObject(scene)
      markSeedGeom.dispose()
      solidMat.dispose()
      wireMat.dispose()
      disposeObject(scene)
      renderer.dispose()
      // release the WebGL context promptly — browsers cap live contexts
      renderer.forceContextLoss()
      container.removeChild(renderer.domElement)
    }
  }, [modelUrl])

  // redraw markers + reproject labels whenever the point list changes
  useEffect(() => {
    apiRef.current.syncMarkers?.(points)
    apiRef.current.updateLabels?.()
  }, [points])

  // redraw seed marks whenever they change
  useEffect(() => {
    apiRef.current.syncMarks?.(marks)
  }, [marks])

  // reflect auto-rotate into the live controls
  useEffect(() => {
    if (apiRef.current.controls) apiRef.current.controls.autoRotate = autoRotate
  }, [autoRotate])

  // swap the display mode (shaded / solid / wireframe) on the live model
  useEffect(() => {
    apiRef.current.setDisplayMode?.(mode)
  }, [mode])

  // push brightness changes into the live renderer (continuous rAF shows it next frame)
  useEffect(() => {
    apiRef.current.setExposure?.(brightness)
  }, [brightness])

  // #5 move tool: push the gizmo mode into the live controls; detach the gizmo
  // whenever the Move tool is turned off (so it can't linger over the model)
  useEffect(() => {
    apiRef.current.setGizmoMode?.(gizmoMode)
  }, [gizmoMode])
  useEffect(() => {
    if (tool !== 'move') apiRef.current.detachTransform?.()
  }, [tool])

  // highlight the hovered part's bbox, and reflect the explode toggle
  useEffect(() => {
    apiRef.current.setHighlight?.(highlightBox)
  }, [highlightBox])
  // glow the selected part/group meshes (by name) so the scope is obvious
  useEffect(() => {
    apiRef.current.setPartHighlight?.(highlightNames)
  }, [highlightNames])
  useEffect(() => {
    apiRef.current.setExploded?.(exploded)
  }, [exploded])

  // focus the inline editor when it opens
  useEffect(() => {
    if (selectedIndex != null) popupRef.current?.focus()
  }, [selectedIndex])

  // export the manually edited model and hand it up as a new version
  const saveEdits = async () => {
    if (!apiRef.current.exportModel || savingEdits) return
    setSavingEdits(true)
    setToolError(null)
    try {
      const buf = await apiRef.current.exportModel()
      await onExportModel?.(buf)
      setDirty(false)
      setTool(null)
    } catch (e) {
      setToolError(e.message || 'Failed to save the edits')
    } finally {
      setSavingEdits(false)
    }
  }

  const selected = selectedIndex != null ? points[selectedIndex] : null
  const selectedPos = selectedIndex != null ? labels[selectedIndex] : null

  const UI_SELECTOR =
    '.viewer-tools, .viewer-modes, .part-buttons, .viewer-toolbar, .viewer-stats, .mversion-strip, .viewer-hint, .viewer-labels'

  // the brightness slider also lifts the BACKDROP around the model (the canvas
  // is transparent, so this CSS glow shows through) — not just the model's
  // exposure. Lets a dark model / dark presentation room read against the void.
  const bt = Math.max(0, Math.min(1, (brightness - 0.6) / 2))
  const g = Math.round(bt * 42)
  const viewerBg = showcase
    ? undefined
    : `radial-gradient(circle at 50% 46%, rgb(${g + 16},${g + 20},${g + 28}), rgb(${g + 4},${g + 5},${g + 10}) 78%)`

  // Manual edit tools + brightness — rendered (via portal) into the Edit tab's
  // panel instead of floating over the canvas. All state/handlers stay here.
  const manualToolsUI = (
    <div className="tool-block edit-manual">
      <span className="tool-label">Shape &amp; paint</span>
      <div className="tool-seg">
        {[
          ['paint', 'Paint'],
          ['sculpt', 'Sculpt'],
          ['place', 'Part'],
          ['move', 'Move'],
        ].map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`tool-seg-btn ${tool === t ? 'on' : ''}`}
            onClick={() => {
              setTool(tool === t ? null : t)
              if (t === 'paint' && tool !== t) setMode('shaded') // paint needs real materials
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tool && (
        <div className="sub-opts">
          {tool !== 'move' && (
            <>
              <label className="sub-opt">
                <span>Colour</span>
                <input
                  type="color"
                  value={paintColor}
                  onChange={(e) => setPaintColor(e.target.value)}
                />
              </label>
              <label className="sub-opt sub-opt--grow">
                <span>Size</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </label>
            </>
          )}
          {tool === 'sculpt' && (
            <button type="button" className="mini-btn" onClick={() => setSculptDir(-sculptDir)}>
              {sculptDir > 0 ? '⬆ Inflate' : '⬇ Dent'}
            </button>
          )}
          {tool === 'place' && (
            <>
              <label className="sub-opt sub-opt--grow">
                <span>Shape</span>
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {['horn', 'spike', 'ball', 'fin', 'plate'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="mini-btn"
                onClick={() => apiRef.current.undoLastPart?.()}
              >
                ↩ Undo
              </button>
            </>
          )}
          {tool === 'move' && (
            <div className="tool-seg tool-seg--sm">
              {[
                ['translate', 'Move'],
                ['rotate', 'Rotate'],
                ['scale', 'Scale'],
              ].map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={`tool-seg-btn ${gizmoMode === m ? 'on' : ''}`}
                  onClick={() => setGizmoMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="mini-btn mini-btn--exit"
            onClick={() => setTool(null)}
          >
            Done
          </button>
        </div>
      )}

      {dirty && (
        <div className="edit-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setTool(null)
              onRevertEdits?.()
            }}
          >
            ↺ Revert
          </button>
          <button
            type="button"
            className="tool-cta tool-cta--sm"
            onClick={saveEdits}
            disabled={savingEdits}
          >
            {savingEdits ? 'Saving…' : 'Save as version'}
          </button>
        </div>
      )}
      {toolError && <span className="url-error">{toolError}</span>}

      <span className="tool-label">View</span>
      <div className="tool-seg tool-seg--5">
        {[
          ['shaded', 'Shaded'],
          ['solid', 'Solid'],
          ['wireframe', 'Wire'],
          ['parts', 'Parts'],
        ].map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`tool-seg-btn ${mode === m ? 'on' : ''}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={`tool-seg-btn ${exploded ? 'on' : ''}`}
          onClick={() => setExploded((v) => !v)}
          title="Explode the parts apart to reveal structure"
        >
          Explode
        </button>
      </div>

      <span className="tool-label">Brightness</span>
      <div className="bright-row">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="range"
          min="0.6"
          max="2.6"
          step="0.05"
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          aria-label="Scene brightness"
        />
      </div>
    </div>
  )

  return (
    <div
      className={`viewer${tool && tool !== 'move' ? ' tool-active' : ''}${tool === 'move' ? ' tool-move' : ''}`}
      ref={containerRef}
      style={viewerBg ? { background: viewerBg } : undefined}
      onPointerMove={(e) => {
        if (!tool || tool === 'move') return // move uses the gizmo, no brush ring
        // over a control panel → normal cursor, no brush ring (so you can click)
        if (e.target.closest?.(UI_SELECTOR)) {
          if (brushCursor) setBrushCursor(null)
          return
        }
        const rect = containerRef.current.getBoundingClientRect()
        setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      onPointerLeave={() => brushCursor && setBrushCursor(null)}
    >
      {tool && tool !== 'move' && brushCursor && (
        <div
          className="brush-cursor"
          style={{
            left: brushCursor.x,
            top: brushCursor.y,
            width: (10 + brushSize * 44) * 2,
            height: (10 + brushSize * 44) * 2,
            borderColor: tool === 'sculpt' ? '#22d3ee' : paintColor,
          }}
        />
      )}
      {!showcase && stats && (
        <div className="viewer-stats" title="Mesh topology">
          <span className="viewer-stats-topo">TRIS</span>
          <span>
            <strong>{stats.faces.toLocaleString()}</strong> faces
          </span>
          <span>
            <strong>{stats.vertices.toLocaleString()}</strong> verts
          </span>
        </div>
      )}
      {/* display-mode + manual tools live in the Edit tab now — portaled below */}
      {manualHost && !showcase && stats && createPortal(manualToolsUI, manualHost)}
      {!showcase && (
        <div className="viewer-labels">
          {labels.map((l, i) =>
            l.visible ? (
              <button
                key={i}
                type="button"
                className={`point-label ${i === selectedIndex ? 'active' : ''} ${
                  points[i]?.prompt?.trim() ? 'has-prompt' : ''
                }`}
                style={{ left: `${l.x}px`, top: `${l.y}px` }}
                onClick={() => callbacksRef.current.onSelectPoint?.(i)}
                title={points[i]?.prompt?.trim() || 'Add a prompt for this point'}
              >
                {i + 1}
              </button>
            ) : null,
          )}
        </div>
      )}

      {!showcase && selected && selectedPos?.visible && (
        <div
          className="point-popup"
          style={{ left: `${selectedPos.x}px`, top: `${selectedPos.y}px` }}
        >
          <div className="point-popup-head">
            <span className="point-popup-num">{selectedIndex + 1}</span>
            <span className="point-popup-region" title={selected.meshName}>
              {selected.meshName}
            </span>
            <button
              type="button"
              className="point-popup-close"
              onClick={() => onSelectPoint?.(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="input-with-mic">
            <textarea
              ref={popupRef}
              className="point-popup-input"
              value={selected.prompt || ''}
              onChange={(e) => onPromptChange?.(selectedIndex, e.target.value)}
              placeholder={`e.g. "make this finger longer"`}
              rows={3}
            />
            <MicButton
              onTranscript={(text) => {
                const cur = selected.prompt || ''
                onPromptChange?.(selectedIndex, cur.trim() ? `${cur.trim()} ${text}` : text)
              }}
            />
          </div>
        </div>
      )}

      {!showcase && (
        <div className="viewer-toolbar">
          <button
            type="button"
            title="Reset camera"
            aria-label="Reset camera"
            onClick={() => apiRef.current.resetView?.()}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={autoRotate ? 'on' : ''}
            title="Auto-rotate"
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((vv) => !vv)}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M3.5 9a9 9 0 0 1 16-2m1 1.5V3.5m0 4h-4M20.5 15a9 9 0 0 1-16 2m-1-1.5V20.5m0-4h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
      {!showcase && clips.length > 0 && (
        <div className="viewer-anim" role="group" aria-label="Animation clips">
          <span className="viewer-anim-label" aria-hidden="true">🎬</span>
          {clips.map((name) => (
            <button
              key={name}
              type="button"
              className={activeClip === name ? 'on' : ''}
              onClick={() => apiRef.current.playClip?.(name)}
              title={`Play "${name}"`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
