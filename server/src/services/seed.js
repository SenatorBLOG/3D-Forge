import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { dbReady } from '../db.js'
import { register } from './auth.js'
import { createPost, listPosts } from './posts.js'
import { toggleLike, addComment } from './social.js'

// Demo seed: fills the community gallery so the landing page + Explore look
// alive for a presentation. Runs only in mock mode (no Mongo) and only when the
// gallery is empty — never touches a real database, never duplicates.
//
// Any *.glb dropped into client/public/models is auto-discovered and used, so
// you can add models without editing this file.

const here = dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = join(here, '../../../client/public/models')
const FALLBACK_MODEL = '/models/robotic_hand.glb'

function discoverModels() {
  try {
    const files = readdirSync(MODELS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.glb'))
      .sort()
    return files.length ? files.map((f) => `/models/${f}`) : [FALLBACK_MODEL]
  } catch {
    return [FALLBACK_MODEL]
  }
}

const DEMO_PASSWORD = 'demo-password'

const USERS = ['nova', 'mecha_smith', 'voxel_witch', 'orin3d', 'claywell', 'protostudio']

// One base mesh shared by the whole community is the project's own premise, so
// these read as different makers' takes / remixes of the same model.
const POSTS = [
  { title: 'Articulated Robotic Hand', model: '/models/robotic_hand.glb', tags: ['robot', 'hardsurface', 'hand'], description: 'Fully rigged five-finger manipulator — my base for prosthetics work.' },
  { title: 'Prismatic Crystal', model: '/models/crystal_gem.glb', tags: ['crystal', 'stylized', 'gem'], description: 'Faceted gem for an RPG loot drop. Great with an emissive shader.' },
  { title: 'Torus Knot Study', model: '/models/torus_sculpt.glb', tags: ['sculpt', 'abstract', 'study'], description: 'Topology practice — clean quads around the knot crossings.' },
  { title: 'Defense Turret Mk II', model: '/models/mech_turret.glb', tags: ['mech', 'hardsurface', 'gamedev'], description: 'Modular base + barrel. Swappable weapon mounts planned.' },
  { title: 'Low-poly Pine', model: '/models/lowpoly_tree.glb', tags: ['lowpoly', 'nature', 'gamedev'], description: 'Under 500 tris — background foliage for a stylized level.' },
  { title: 'Runed Broadsword', model: '/models/runed_sword.glb', tags: ['weapon', 'fantasy', 'concept'], description: 'Hero weapon concept. Gold crossguard, etched blade next pass.' },
  { title: 'Retro Rocket', model: '/models/retro_rocket.glb', tags: ['scifi', 'stylized', 'vehicle'], description: 'Chunky cartoon rocket with fins — testing silhouette reads.' },
  { title: 'Cyber Helmet', model: '/models/cyber_helmet.glb', tags: ['scifi', 'wearable', 'concept'], description: 'Visor prototype for a courier character. Neon strip is emissive.' },
  { title: 'Reading Chair', model: '/models/reading_chair.glb', tags: ['furniture', 'archviz', 'prop'], description: 'Simple wooden chair for an interior scene — scale reference.' },
  { title: 'Signet Ring', model: '/models/signet_ring.glb', tags: ['jewelry', 'prop', 'stylized'], description: 'Chunky signet with a gem face. Good for 3D-print tests.' },
  { title: 'Companion Bot Head', model: '/models/companion_bot.glb', tags: ['robot', 'character', 'concept'], description: 'Friendly desk-bot head — big eyes, little antenna.' },
  { title: 'Temple Pyramid', model: '/models/temple_pyramid.glb', tags: ['environment', 'stylized', 'archviz'], description: 'Stepped temple block-in with a gilded capstone.' },
]

const COMMENTS = [
  'Clean topology — love it.',
  'How did you handle the thumb joint?',
  'This would rig really well.',
  'Hardsurface looks crisp 🔥',
  'Using this as reference, thanks for sharing!',
  'The knuckle detail is great.',
]

// deterministic so the demo looks identical every boot (no Math.random)
const pick = (arr, n) => arr[n % arr.length]

export async function seedDemoData() {
  if (dbReady()) return // never seed a real database
  if (process.env.SEED_DEMO === 'false') return
  if ((await listPosts({ limit: 1 })).length > 0) return // already populated

  const models = discoverModels()
  const users = []
  for (const username of USERS) {
    try {
      const { user } = await register(username, DEMO_PASSWORD)
      users.push(user)
    } catch {
      // username taken (re-seed of a warm store) — skip this user
    }
  }
  if (users.length === 0) return

  const created = []
  for (let i = 0; i < POSTS.length; i++) {
    const spec = POSTS[i]
    const author = pick(users, i)
    const post = await createPost(author, {
      title: spec.title,
      // each post names its own model; fall back to cycling if it's missing
      modelUrl: spec.model && models.includes(spec.model) ? spec.model : pick(models, i),
      description: spec.description,
      tags: spec.tags,
    })
    created.push(post)
  }

  // spread likes + a few comments so counts vary and the feed feels active
  for (let i = 0; i < created.length; i++) {
    const post = created[i]
    const likeCount = ((i * 7) % 5) + 1 // 1..5, deterministic
    for (let u = 0; u < likeCount && u < users.length; u++) {
      await toggleLike(users[(i + u) % users.length].id, post.id)
    }
    if (i % 3 === 0) {
      const commenter = pick(users, i + 1)
      await addComment(commenter, post.id, pick(COMMENTS, i))
    }
  }

  console.log(
    `Seeded demo gallery: ${created.length} posts by ${users.length} users ` +
      `across ${models.length} model(s).`,
  )
}
