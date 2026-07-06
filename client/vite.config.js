import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/files': 'http://localhost:3001', // cloud-stored models/images (GridFS)
      '/images': 'http://localhost:3001', // reference images (disk mode)
    },
  },
})
