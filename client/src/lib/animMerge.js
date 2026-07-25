import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { toLoadableUrl } from './modelUrl.js'

// Task 6 — merge several single-clip animated GLBs that SHARE ONE SKELETON (all
// produced from the same Tripo rig) into one GLB carrying EVERY clip. The rigged
// mesh + bone names are identical across the files, so we keep the first scene
// and collect every clip; three.js binds animation tracks to nodes by name, which
// match across the files. This is why adding a clip later never re-charges the
// old ones — each is fetched once and re-combined here for free.

const loader = new GLTFLoader()
const loadGltf = (url) =>
  new Promise((resolve, reject) => loader.load(toLoadableUrl(url), resolve, undefined, reject))

/**
 * @param {{url:string, preset:string}[]} entries  single-clip animated GLBs
 * @returns {Promise<ArrayBuffer>} a binary GLB with one named clip per entry
 */
export async function mergeAnimatedGlbs(entries) {
  const gltfs = await Promise.all(entries.map((e) => loadGltf(e.url)))
  const base = gltfs[0].scene
  const clips = []
  gltfs.forEach((g, i) => {
    // each source GLB carries exactly one clip; name it after its preset
    const name = entries[i].preset.replace(/^preset:/, '')
    g.animations.forEach((clip) => {
      clip.name = name
      clips.push(clip)
    })
  })
  return new Promise((resolve, reject) =>
    new GLTFExporter().parse(base, resolve, reject, { binary: true, animations: clips }),
  )
}
