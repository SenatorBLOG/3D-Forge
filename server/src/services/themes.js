import { listPosts } from './posts.js'

// Curated theme taxonomy (B9): a theme is a hand-picked bundle of tags, so the
// Discover page can offer stable, designed categories on top of the organic
// tag cloud. Filtering works in both stores because it reuses listPosts.

export const THEMES = [
  { id: 'fantasy', label: 'Fantasy', tags: ['fantasy', 'dragon', 'weapon', 'gem', 'jewelry'] },
  { id: 'sci-fi', label: 'Sci-Fi', tags: ['scifi', 'cyberpunk', 'robot', 'mech', 'vehicle'] },
  { id: 'gamedev', label: 'Game Dev', tags: ['gamedev', 'lowpoly', 'rigging', 'toy'] },
  { id: 'architecture', label: 'Architecture', tags: ['archviz', 'environment', 'furniture', 'interior'] },
  { id: 'art', label: 'Art & Abstract', tags: ['abstract', 'sculpt', 'stylized', 'study', 'print'] },
]

/** Resolve a theme id to its definition, or null. */
export const getTheme = (id) => THEMES.find((t) => t.id === id) ?? null

/** All themes with a live post count each (for Discover's tabs). */
export async function listThemes() {
  return Promise.all(
    THEMES.map(async (t) => {
      const posts = await listPosts({ anyTags: t.tags, limit: 100 })
      return { id: t.id, label: t.label, tags: t.tags, count: posts.length }
    }),
  )
}
