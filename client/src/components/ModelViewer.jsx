import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const HIGHLIGHT_COLOR = 0x5cc8ff // steel — matches the spatial-data accent
const MARKER_COLOR = 0xff7a1f // molten amber — matches the brand action accent

/**
 * Browser 3D viewer: loads a GLB/glTF model, orbit controls, and raycast click
 * selection. A click highlights the hit sub-mesh and reports the 3D point plus
 * the region label (mesh name) via onSelect — the seed of the spatial prompt.
 *
 * Props:
 *   modelUrl  — URL (or object URL) of the GLB to display
 *   onSelect  — called with { point, meshName } when the user picks a point on the mesh
 *   onLoaded  — called once the model has been added to the scene
 *   onError   — called with a human-readable message when loading fails
 */
export default function ModelViewer({ modelUrl, onSelect, onLoaded, onError }) {
  const containerRef = useRef(null)
  // keep latest callbacks without re-creating the whole scene on re-render
  const callbacksRef = useRef({})
  callbacksRef.current = { onSelect, onLoaded, onError }
  // imperative handles the toolbar buttons reach into the live scene through
  const apiRef = useRef({})
  const [wireframe, setWireframe] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const wireframeRef = useRef(false)
  wireframeRef.current = wireframe

  useEffect(() => {
    const container = containerRef.current
    // guards async loader callbacks that may fire after unmount/model swap
    let disposed = false

    // dispose geometries, materials AND their textures for a whole subtree
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

    // marker shown at the selected point
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 16, 16),
      new THREE.MeshBasicMaterial({ color: MARKER_COLOR }),
    )
    marker.visible = false
    scene.add(marker)

    // highlight of the selected sub-mesh: swap in a cloned material with an
    // emissive tint; the original is restored (and the clone disposed) on
    // re-selection, model swap, and unmount
    let highlight = null // { mesh, originalMaterial, cloneMaterial }

    const clearHighlight = () => {
      if (!highlight) return
      highlight.mesh.material = highlight.originalMaterial
      highlight.cloneMaterial.dispose()
      highlight = null
    }

    const highlightMesh = (mesh) => {
      if (highlight?.mesh === mesh) return
      clearHighlight()
      // multi-material meshes are rare in generated GLBs — skip highlight there
      if (Array.isArray(mesh.material) || !mesh.material?.emissive) return
      const clone = mesh.material.clone()
      clone.emissive = new THREE.Color(HIGHLIGHT_COLOR)
      clone.emissiveIntensity = 0.45
      clone.wireframe = wireframeRef.current
      highlight = { mesh, originalMaterial: mesh.material, cloneMaterial: clone }
      mesh.material = clone
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

    // toolbar handles — populated once the model frames itself
    const applyWireframe = (on) => {
      if (!model) return
      model.traverse((o) => {
        if (!o.isMesh) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => m && (m.wireframe = on))
      })
    }
    let homePosition = null
    apiRef.current = {
      controls,
      applyWireframe,
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
          // model swap / unmount won the race — drop the late arrival cleanly
          disposeObject(gltf.scene)
          return
        }
        model = gltf.scene
        // center the model at the origin and frame the camera around it
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3()).length()
        model.position.sub(center)
        camera.position.set(size * 0.7, size * 0.5, size * 0.9)
        camera.near = size / 100
        camera.far = size * 10
        camera.updateProjectionMatrix()
        homePosition = camera.position.clone()
        marker.geometry.dispose()
        marker.geometry = new THREE.SphereGeometry(size * 0.012, 16, 16)

        // ground grid under the model, on the brand palette
        const grid = new THREE.GridHelper(size * 1.6, 22, 0x5cc8ff, 0x2a3242)
        grid.position.y = box.min.y - center.y
        grid.material.transparent = true
        grid.material.opacity = 0.3
        scene.add(grid)

        scene.add(model)
        applyWireframe(wireframeRef.current)
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

    // raycast click → selection; drags (orbiting) are ignored
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
        marker.position.copy(hit.point)
        marker.visible = true
        highlightMesh(hit.object)
        callbacksRef.current.onSelect?.({
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          meshName: regionLabel(hit.object),
        })
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)

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
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      clearHighlight() // restore original material before disposal below
      disposeObject(scene)
      renderer.dispose()
      // release the WebGL context promptly — browsers cap live contexts, and
      // every model swap creates a fresh renderer
      renderer.forceContextLoss()
      container.removeChild(renderer.domElement)
    }
  }, [modelUrl])

  // reflect toolbar state into the live scene
  useEffect(() => {
    apiRef.current.applyWireframe?.(wireframe)
  }, [wireframe])
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
          className={wireframe ? 'on' : ''}
          title="Toggle wireframe"
          aria-pressed={wireframe}
          onClick={() => setWireframe((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <path
              d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v18M4 7.5l8 4.5 8-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
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
