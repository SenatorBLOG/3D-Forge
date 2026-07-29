import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Renders a GLB to PNG data URLs once and caches them by model URL:
//   { shaded } — the lit model (front),
//   { wire }   — a cyan wireframe ("reveal the geometry" on card hover), and
//   { views }  — three more shaded angles (90°/180°/270° orbit) for the
//                hover-reveal multi-angle strip on cards.
// Cards show a real preview without each mounting a live WebGL viewer (browsers
// cap concurrent contexts). Renders are serialized through a queue, so at most
// one transient context exists at a time and it's disposed right after capture.

const WIDTH = 440
const HEIGHT = 300
const WIRE_COLOR = 0x22d3ee // electric cyan — matches the brand action accent

const cache = new Map() // modelUrl -> Promise<{ shaded, wire }>
let queue = Promise.resolve() // one render at a time

const disposeMaterial = (m) => {
  if (!m) return
  ;(Array.isArray(m) ? m : [m]).forEach((mat) => {
    Object.values(mat).forEach((v) => v?.isTexture && v.dispose())
    mat.dispose()
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
    const rim = new THREE.DirectionalLight(0x22d3ee, 0.9)
    rim.position.set(-3, 2, -4)
    scene.add(rim)

    let wireMat
    const teardown = (model) => {
      if (model) {
        const origMats = []
        model.traverse((o) => {
          o.geometry?.dispose()
          if (o.isMesh && o.userData.origMat) origMats.push(o.userData.origMat)
        })
        origMats.forEach(disposeMaterial)
      }
      wireMat?.dispose()
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
          // One camera for EVERY model (no per-engine mirror) so all cards + all
          // version thumbnails face the SAME way. Camera on -x → the model faces
          // LEFT, i.e. toward the centre/main model (the cards + version strip both
          // sit on the RIGHT edge, so facing left points them inward).
          const sx = -1
          camera.position.set(size * 0.6 * sx, size * 0.45, size * 0.85)
          camera.near = size / 100
          camera.far = size * 10
          camera.lookAt(0, 0, 0)
          camera.updateProjectionMatrix()
          scene.add(model)

          // pass 1 — shaded (front)
          renderer.render(scene, camera)
          const shaded = canvas.toDataURL('image/png')

          // pass 2 — three more shaded angles, orbiting at the same radius and
          // elevation (feeds the hover-reveal multi-angle strip on cards)
          const radius = Math.hypot(0.6, 0.85) * size
          const baseAz = Math.atan2(0.6 * sx, 0.85)
          const views = []
          for (const quarter of [1, 2, 3]) {
            const az = baseAz + (quarter * Math.PI) / 2
            camera.position.set(Math.sin(az) * radius, size * 0.45, Math.cos(az) * radius)
            camera.lookAt(0, 0, 0)
            renderer.render(scene, camera)
            views.push(canvas.toDataURL('image/png'))
          }
          // back to the front angle for the wireframe pass
          camera.position.set(size * 0.6 * sx, size * 0.45, size * 0.85)
          camera.lookAt(0, 0, 0)

          // pass 3 — cyan wireframe (stash originals so we can dispose them)
          wireMat = new THREE.MeshBasicMaterial({ color: WIRE_COLOR, wireframe: true })
          model.traverse((o) => {
            if (o.isMesh) {
              o.userData.origMat = o.material
              o.material = wireMat
            }
          })
          renderer.render(scene, camera)
          const wire = canvas.toDataURL('image/png')

          teardown(model)
          resolve({ shaded, wire, views })
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

/** Get (or start) the cached { shaded, wire, views } render for a model URL. */
export function getThumbnail(modelUrl) {
  if (!modelUrl) return Promise.reject(new Error('no modelUrl'))
  if (cache.has(modelUrl)) return cache.get(modelUrl)
  const p = queue.then(() => renderThumbnail(modelUrl))
  queue = p.catch(() => {}) // keep the queue alive even if one render fails
  // DON'T keep a failed render cached — a just-created version's GLB may not be
  // fetchable on the very first try; dropping the entry lets a retry re-render it
  // (this is why new thumbnails used to stay blank until a full F5 cleared it).
  p.catch(() => {
    if (cache.get(modelUrl) === p) cache.delete(modelUrl)
  })
  cache.set(modelUrl, p)
  return p
}

// --- 4.1 clean straight-on views for reconstruction (multiview / image→3D) ---
// Unlike the card thumbnail's 3/4 angle, these are LEVEL shots at exact azimuths
// in Tripo's [front, left, back, right] slot order — so multiview reconstructs
// cleanly and the views don't diverge in style (the cause of the "mush"). Square
// frames suit the providers better. count 1 → [front]; 2 → [front, side];
// 4 → [front, left, back, right]. Returns { views: [{ label, dataUrl }] }.
const VIEW_SIZE = 512

// Clean front + back plus two 3/4 (полубок) side views — the flat ±90° profiles
// looked alike / unreadable, and the 3/4 angle (like the original capture) reads
// much better and reconstructs cleaner. All relative to FRONT_AZ (the viewer's
// front) in renderViews.
const viewPlan = (count) =>
  count <= 1
    ? [{ label: 'Front', az: 0 }]
    : count === 2
      ? [{ label: 'Front', az: 0 }, { label: 'Side', az: Math.PI / 4 }]
      : [
          { label: 'Front', az: 0 },
          { label: 'Left', az: -Math.PI / 4 },
          { label: 'Right', az: Math.PI / 4 },
          { label: 'Back', az: Math.PI },
        ]

function renderViews(modelUrl, count) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = VIEW_SIZE
    canvas.height = VIEW_SIZE
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(1)
    renderer.setSize(VIEW_SIZE, VIEW_SIZE, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    scene.add(new THREE.HemisphereLight(0x8fb4d6, 0x1a1208, 0.9))
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2)
    key.position.set(3, 5, 2)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-2, 1, 4)
    scene.add(fill)

    const cleanup = (model) => {
      model?.traverse((o) => {
        o.geometry?.dispose()
        ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (!m) return
          Object.values(m).forEach((v) => v?.isTexture && v.dispose())
          m.dispose()
        })
      })
      renderer.dispose()
      renderer.forceContextLoss()
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
          scene.add(model)
          camera.near = size / 100
          camera.far = size * 10
          // pull the camera back far enough that the WHOLE model fits the frame
          // (fit the bounding sphere of radius size/2 to the 45° FOV, + margin) —
          // the old 0.72·size was too close and cropped the head/top off the views
          const fov = (45 * Math.PI) / 180
          const R = (size / 2 / Math.sin(fov / 2)) * 1.15
          const E = size * 0.06 // near-level → clean straight-on profiles
          // "Front" = the SAME angle the live viewer shows the model from (its
          // camera sits at x=0.7, z=0.9), so the labelled front matches what the
          // user sees; the other views are ±90°/180° around that. This aligns
          // labels to the model's apparent front without hardcoding per-model.
          const FRONT_AZ = Math.atan2(0.7, 0.9)
          const views = []
          for (const v of viewPlan(count)) {
            const az = v.az + FRONT_AZ
            camera.position.set(Math.sin(az) * R, E, Math.cos(az) * R)
            camera.lookAt(0, 0, 0)
            camera.updateProjectionMatrix()
            renderer.render(scene, camera)
            views.push({ label: v.label, dataUrl: canvas.toDataURL('image/png') })
          }
          cleanup(model)
          resolve({ views })
        } catch (err) {
          cleanup()
          reject(err)
        }
      },
      undefined,
      (err) => {
        cleanup()
        reject(err)
      },
    )
  })
}

/** Render `count` (1|2|4) clean straight-on views of a model, queued like the
 *  thumbnail renders so we never hold multiple WebGL contexts at once. */
export function captureViews(modelUrl, count = 4) {
  if (!modelUrl) return Promise.reject(new Error('no modelUrl'))
  const p = queue.then(() => renderViews(modelUrl, count))
  queue = p.catch(() => {})
  return p
}
