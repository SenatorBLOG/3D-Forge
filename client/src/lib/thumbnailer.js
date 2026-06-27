import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Renders a GLB to a PNG data URL once and caches it by model URL. Cards can
// then show a real preview without each mounting a live WebGL viewer (browsers
// cap concurrent contexts). Renders are serialized through a queue, so at most
// one transient context exists at a time and it's disposed right after capture.

const WIDTH = 440
const HEIGHT = 300

const cache = new Map() // modelUrl -> Promise<dataURL>
let queue = Promise.resolve() // one render at a time

function disposeTree(root) {
  root?.traverse?.((o) => {
    o.geometry?.dispose()
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => {
      if (!m) return
      Object.values(m).forEach((v) => v?.isTexture && v.dispose())
      m.dispose()
    })
  })
}

function renderThumbnail(modelUrl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true, // transparent — the model floats on the card's gradient
      preserveDrawingBuffer: true, // needed for toDataURL
    })
    renderer.setPixelRatio(1)
    renderer.setSize(WIDTH, HEIGHT, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.01, 100)
    // same three-point lighting as the live viewer, for visual consistency
    scene.add(new THREE.HemisphereLight(0x8fb4d6, 0x1a1208, 0.7))
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2)
    key.position.set(3, 5, 2)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x5cc8ff, 0.9)
    rim.position.set(-3, 2, -4)
    scene.add(rim)

    const teardown = (model) => {
      disposeTree(model)
      renderer.dispose()
      renderer.forceContextLoss() // release the context immediately
    }

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        try {
          const model = gltf.scene
          const box = new THREE.Box3().setFromObject(model)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3()).length()
          model.position.sub(center)
          camera.position.set(size * 0.6, size * 0.45, size * 0.85)
          camera.near = size / 100
          camera.far = size * 10
          camera.lookAt(0, 0, 0)
          camera.updateProjectionMatrix()
          scene.add(model)
          renderer.render(scene, camera)
          const url = canvas.toDataURL('image/png')
          teardown(model)
          resolve(url)
        } catch (err) {
          teardown()
          reject(err)
        }
      },
      undefined,
      (err) => {
        teardown()
        reject(err)
      },
    )
  })
}

/** Get (or start) the cached thumbnail render for a model URL. */
export function getThumbnail(modelUrl) {
  if (!modelUrl) return Promise.reject(new Error('no modelUrl'))
  if (cache.has(modelUrl)) return cache.get(modelUrl)
  const p = queue.then(() => renderThumbnail(modelUrl))
  queue = p.catch(() => {}) // keep the queue alive even if one render fails
  cache.set(modelUrl, p)
  return p
}
