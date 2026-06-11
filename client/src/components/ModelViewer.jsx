import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * Browser 3D viewer: loads a GLB/glTF model, orbit controls, and raycast click
 * selection. A click on the mesh places a marker and reports the 3D point up via
 * onSelectPoint — that point is the seed of the spatial prompt.
 */
export default function ModelViewer({ modelUrl, onSelectPoint }) {
  const containerRef = useRef(null)
  // keep the latest callback without re-creating the whole scene on re-render
  const onSelectPointRef = useRef(onSelectPoint)
  onSelectPointRef.current = onSelectPoint

  useEffect(() => {
    const container = containerRef.current

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

    let model = null
    const loader = new GLTFLoader()
    loader.load(
      modelUrl,
      (gltf) => {
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
      },
      undefined,
      (err) => console.error(`Failed to load model ${modelUrl}:`, err),
    )

    // raycast click → selected point; drags (orbiting) are ignored
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
        onSelectPointRef.current?.({
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
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
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      scene.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((m) => m?.dispose())
      })
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [modelUrl])

  return <div className="viewer" ref={containerRef} />
}
