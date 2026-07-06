import { Router } from 'express'
import { cloudFilesEnabled, openCloudFile } from '../services/files.js'

const router = Router()

// GET /files/<name> — stream a cloud-stored file (images, GLBs). Only exists
// meaningfully when Mongo is connected; without it the local static mounts
// (/images, /uploads) serve the same content from disk.
router.get('/:name', async (req, res) => {
  if (!cloudFilesEnabled()) return res.status(404).json({ error: 'cloud files not enabled' })
  try {
    const file = await openCloudFile(req.params.name)
    if (!file) return res.status(404).json({ error: 'file not found' })
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Length', file.length)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // ids are unique
    file.stream.on('error', (err) => {
      console.error('file stream failed:', err)
      if (!res.headersSent) res.status(500).end()
      else res.end()
    })
    file.stream.pipe(res)
  } catch (err) {
    console.error('file read failed:', err)
    res.status(500).json({ error: 'failed to read the file' })
  }
})

export default router
