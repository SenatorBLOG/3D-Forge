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
  { title: 'Articulated Robotic Hand', tags: ['robot', 'hardsurface', 'hand'], description: 'Fully rigged five-finger manipulator — my base for prosthetics work.' },
  { title: 'Cyber Prosthetic v2', tags: ['prosthetic', 'scifi', 'hand'], description: 'Second pass, cleaner palm topology and tighter knuckles.' },
  { title: 'Low-poly Gripper', tags: ['lowpoly', 'gripper', 'gamedev'], description: 'Game-ready, under 4k tris. Good for background props.' },
  { title: 'Battle Mech Claw', tags: ['mech', 'hardsurface', 'concept'], description: 'Scaled up into a heavy-duty mech claw for a concept piece.' },
  { title: 'Anatomical Study — Hand', tags: ['anatomy', 'sculpt', 'study'], description: 'Studying joint placement and proportions from reference.' },
  { title: 'Steampunk Manipulator', tags: ['steampunk', 'hardsurface', 'concept'], description: 'Brass-and-rivets reskin idea — sharing the base form.' },
  { title: 'Exosuit Forearm', tags: ['exosuit', 'scifi', 'mech'], description: 'Forearm + hand assembly for a powered-armor character.' },
  { title: 'Toon Hand Rig', tags: ['toon', 'rig', 'gamedev'], description: 'Stylized, chunky proportions for a cartoon character.' },
  { title: 'Hardsurface Gauntlet', tags: ['hardsurface', 'armor', 'concept'], description: 'Plated gauntlet pass — testing the spatial edit tool on the knuckles.' },
  { title: 'Assistant Bot Hand', tags: ['robot', 'concept', 'hand'], description: 'Friendly service-robot hand. Softer edges, rounded fingertips.' },
  { title: 'Sculpt Practice #4', tags: ['sculpt', 'study', 'wip'], description: 'Weekly sculpt practice — feedback welcome on the thumb.' },
  { title: 'Drone Landing Claw', tags: ['drone', 'hardsurface', 'scifi'], description: 'Repurposed the hand into a landing/grab claw for a delivery drone.' },
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
      modelUrl: pick(models, i), // cycles through every discovered model
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
