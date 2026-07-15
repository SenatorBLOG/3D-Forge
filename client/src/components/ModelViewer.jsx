import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import MicButton from './MicButton.jsx'
import { toLoadableUrl } from '../lib/modelUrl.js'

const MARKER_COLOR = 0xff2d9b // hot magenta — matches the selection accent
const BASE_EXPOSURE = 1.1 // tone-mapping exposure at brightness 1.0 (slider multiplies it)

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
  highlightBox = null,
  showcase = false,
}) {
  const containerRef = useRef(null)
  // keep latest callbacks/points without re-creating the whole scene on re-render
  const callbacksRef = useRef({})
  callbacksRef.current = { onAddPoint, onSelectPoint, onLoaded, onError }
  const pointsRef = useRef(points)
  pointsRef.current = points
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

    // three-point lighting: cool sky/ground ambient + warm key + steel rim
    scene.add(new THREE.HemisphereLight(0x8fb4d6, 0x1a1208, 0.7))
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2)
    keyLight.position.set(3, 5, 2)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.9)
    rimLight.position.set(-3, 2, -4)
    scene.add(rimLight)

    // markers are drawn from the `points` prop; small spheres sharing one
    // geometry + material, recreated whenever the point list changes
    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    const markerMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR })
    let markerGeom = new THREE.SphereGeometry(0.01, 16, 16)

    // display-mode override materials (Meshy-style solid / wireframe views).
    // Each mesh keeps its original material in userData.origMat for "shaded".
    const solidMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.1, roughness: 0.78 })
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true })
    const applyDisplayMode = (m) => {
      if (!model) return
      model.traverse((o) => {
        if (!o.isMesh) return
        o.material = m === 'wireframe' ? wireMat : m === 'solid' ? solidMat : o.userData.origMat
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

    apiRef.current = {
      controls,
      syncMarkers,
      updateLabels,
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
      setExploded,
    }

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
        // record each mesh's outward direction (from center) for the explode toggle
        model.updateWorldMatrix(true, true)
        model.traverse((o) => {
          if (!o.isMesh) return
          const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
          const dir =
            c.lengthSq() > 1e-6 ? c.clone().normalize().multiplyScalar(size * 0.5) : new THREE.Vector3()
          explodeParts.push({ mesh: o, origPos: o.position.clone(), dir })
        })
        camera.position.set(size * 0.7, size * 0.5, size * 0.9)
        camera.near = size / 100
        camera.far = size * 10
        camera.updateProjectionMatrix()
        homePosition = camera.position.clone()

        // marker radius scaled to the model — small, not a giant blob
        markerGeom.dispose()
        markerGeom = new THREE.SphereGeometry(size * 0.006, 16, 16)

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
        syncMarkers(pointsRef.current)
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

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    // labels follow the model as the camera moves (orbit/zoom/pan)
    controls.addEventListener('change', updateLabels)

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
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      apiRef.current = {}
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.removeEventListener('change', updateLabels)
      controls.dispose()
      if (highlightHelper) {
        highlightHelper.geometry?.dispose()
        highlightHelper.material?.dispose()
      }
      markersGroup.clear()
      markerGeom.dispose()
      markerMat.dispose()
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

  // highlight the hovered part's bbox, and reflect the explode toggle
  useEffect(() => {
    apiRef.current.setHighlight?.(highlightBox)
  }, [highlightBox])
  useEffect(() => {
    apiRef.current.setExploded?.(exploded)
  }, [exploded])

  // focus the inline editor when it opens
  useEffect(() => {
    if (selectedIndex != null) popupRef.current?.focus()
  }, [selectedIndex])

  const selected = selectedIndex != null ? points[selectedIndex] : null
  const selectedPos = selectedIndex != null ? labels[selectedIndex] : null

  return (
    <div className="viewer" ref={containerRef}>
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
      {!showcase && stats && (
        <div className="viewer-modes" role="group" aria-label="Display mode">
          {[
            ['shaded', 'Shaded'],
            ['solid', 'Solid'],
            ['wireframe', 'Wire'],
          ].map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'on' : ''}
              onClick={() => setMode(m)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={exploded ? 'on' : ''}
            onClick={() => setExploded((v) => !v)}
            title="Explode the parts apart to reveal structure"
          >
            Explode
          </button>
        </div>
      )}
      {!showcase && stats && (
        <div className="viewer-brightness" title={`Brightness ${Math.round(brightness * 100)}%`}>
          <span className="viewer-brightness-icon" aria-hidden="true">☀</span>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            aria-label="Viewer brightness"
          />
          {brightness !== 1 && (
            <button
              type="button"
              className="viewer-brightness-reset"
              onClick={() => setBrightness(1)}
              title="Reset brightness"
            >
              ⟳
            </button>
          )}
        </div>
      )}
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
    </div>
  )
}
