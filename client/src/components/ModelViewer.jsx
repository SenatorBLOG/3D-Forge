import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MARKER_COLOR = 0xff7a1f // molten amber — matches the brand action accent

/**
 * Browser 3D viewer: loads a GLB/glTF model, orbit controls, and raycast click
 * selection. Each click adds a point (reported via onAddPoint); the parent owns
 * the list of points and passes it back as `points`, which the viewer draws as
 * amber markers — so points can be removed from the sidebar.
 *
 * Props:
 *   modelUrl    — URL (or object URL) of the GLB to display
 *   points      — [{ point: {x,y,z}, meshName }] markers to draw (source of truth)
 *   onAddPoint  — called with { point, meshName } when the user clicks the mesh
 *   onLoaded    — called once the model has been added to the scene
 *   onError     — called with a human-readable message when loading fails
 */
export default function ModelViewer({ modelUrl, points, onAddPoint, onLoaded, onError }) {
  const containerRef = useRef(null)
  // keep latest callbacks/points without re-creating the whole scene on re-render
  const callbacksRef = useRef({})
  callbacksRef.current = { onAddPoint, onLoaded, onError }
  const pointsRef = useRef(points)
  pointsRef.current = points
  // imperative handles the toolbar + points effect reach into the live scene
  const apiRef = useRef({})
  const [autoRotate, setAutoRotate] = useState(false)

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
    renderer.toneMappingExposure = 1.1
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
    const rimLight = new THREE.DirectionalLight(0x5cc8ff, 0.9)
    rimLight.position.set(-3, 2, -4)
    scene.add(rimLight)

    // markers are drawn from the `points` prop; small spheres sharing one
    // geometry + material, recreated whenever the point list changes
    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    const markerMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR })
    let markerGeom = new THREE.SphereGeometry(0.01, 16, 16)

    const syncMarkers = (pts) => {
      markersGroup.clear() // children share geom+mat, disposed once at teardown
      pts.forEach((p) => {
        const dot = new THREE.Mesh(markerGeom, markerMat)
        dot.position.set(p.point.x, p.point.y, p.point.z)
        markersGroup.add(dot)
      })
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
    apiRef.current = {
      controls,
      syncMarkers,
      resetView: () => {
        if (!homePosition) return
        camera.position.copy(homePosition)
        controls.target.set(0, 0, 0)
        controls.update()
      },
    }

    let model = null
    const loader = new GLTFLoader()
    loader.load(
      modelUrl,
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
        camera.position.set(size * 0.7, size * 0.5, size * 0.9)
        camera.near = size / 100
        camera.far = size * 10
        camera.updateProjectionMatrix()
        homePosition = camera.position.clone()

        // marker radius scaled to the model — small, not a giant blob
        markerGeom.dispose()
        markerGeom = new THREE.SphereGeometry(size * 0.006, 16, 16)

        const grid = new THREE.GridHelper(size * 1.6, 22, 0x5cc8ff, 0x2a3242)
        grid.position.y = box.min.y - center.y
        grid.material.transparent = true
        grid.material.opacity = 0.3
        scene.add(grid)

        scene.add(model)
        syncMarkers(pointsRef.current)
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

    const onResize = () => {
      if (!container.clientWidth || !container.clientHeight) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
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
      controls.dispose()
      markersGroup.clear()
      markerGeom.dispose()
      markerMat.dispose()
      disposeObject(scene)
      renderer.dispose()
      // release the WebGL context promptly — browsers cap live contexts
      renderer.forceContextLoss()
      container.removeChild(renderer.domElement)
    }
  }, [modelUrl])

  // redraw markers whenever the point list changes
  useEffect(() => {
    apiRef.current.syncMarkers?.(points)
  }, [points])

  // reflect auto-rotate into the live controls
  useEffect(() => {
    if (apiRef.current.controls) apiRef.current.controls.autoRotate = autoRotate
  }, [autoRotate])

  return (
    <div className="viewer" ref={containerRef}>
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
          onClick={() => setAutoRotate((v) => !v)}
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
    </div>
  )
}
