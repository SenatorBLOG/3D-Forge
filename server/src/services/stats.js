import { listPosts } from './posts.js'
import { likeInfo } from './social.js'
import { followCounts } from './follows.js'
import { listLibrary } from './library.js'

// Profile stats + achievements (B11). Badges are DERIVED from the live numbers
// at read time — deterministic, no extra storage, and they work identically in
// mock and Mongo mode. Crossing a milestone "awards" the badge on the next read.

// Every badge the platform knows. `earned` receives the computed stats.
export const BADGES = [
  { id: 'first-forge', label: 'First Forge', description: 'Generated a first model', earned: (s) => s.creations >= 1 },
  { id: 'maker-5', label: 'Serial Maker', description: 'Generated 5 models', earned: (s) => s.creations >= 5 },
  { id: 'published', label: 'Going Public', description: 'Published a model to the gallery', earned: (s) => s.published >= 1 },
  { id: 'curator-5', label: 'Curator', description: 'Published 5 models', earned: (s) => s.published >= 5 },
  { id: 'liked-10', label: 'Crowd Pleaser', description: 'Collected 10 likes across your posts', earned: (s) => s.likesReceived >= 10 },
  { id: 'popular-3', label: 'Rising Star', description: 'Gained 3 followers', earned: (s) => s.followers >= 3 },
]

/**
 * Aggregate a user's public stats + badges. `user` is { id, username } (the
 * route resolves the username first). Returns
 * { creations, published, likesReceived, followers, following,
 *   badges: [{ id, label, description, earned }] }.
 */
export async function userStats(user) {
  const [library, posts, follows] = await Promise.all([
    listLibrary({ userId: user.id, owner: 'me', limit: 1 }), // total is what we need
    listPosts({ authorId: user.id, limit: 100 }),
    followCounts(user.id),
  ])
  const likeCounts = await Promise.all(posts.map((p) => likeInfo(p.id)))
  const stats = {
    creations: library.total,
    published: posts.length,
    likesReceived: likeCounts.reduce((sum, l) => sum + l.likes, 0),
    followers: follows.followers,
    following: follows.following,
  }
  return {
    ...stats,
    badges: BADGES.map(({ id, label, description, earned }) => ({
      id,
      label,
      description,
      earned: earned(stats),
    })),
  }
}
