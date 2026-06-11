import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const HIGHLIGHT_COLOR = 0x4f6ef7

/**
 * Browser 3D viewer: loads a GLB/glTF model, orbit controls, and raycast click
 * selection. A click highlights the hit sub-mesh and reports the 3D point plus
 * the region label (mesh name) via onSelect — the seed of the spatial prompt.
 *
 * Props:
 *   modelUrl  — URL (or object URL) of the GLB to display
 *   onSelect  — ({ point: {x,y,z}, meshName: string }) => void
 *   onLoaded  — () => void, fires when the model is in the scene
 *   onError   — (message: string) => void, fires when loading fails
 */
export default function ModelViewer({ modelUrl, onSelect, onLoaded, onError }) {
  const containerRef = useRef(null)
  // keep latest callbacks without re-creating the whole scene on re-render
  const callbacksRef = useRef({})
  callbacksRef.current = { onSelect, onLoaded, onError }

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
    scene.background = new THREE.Color(0x15171c)

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      100,
    )
    camera.position.set(0.6, 0.4, 0.8)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4)
    dirLight.position.set(2, 4, 3)
    scene.add(dirLight)

    // marker shown at the selected point
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d }),
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
        marker.geometry.dispose()
        marker.geometry = new THREE.SphereGeometry(size * 0.012, 16, 16)
        scene.add(model)
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

  return <div className="viewer" ref={containerRef} />
}
