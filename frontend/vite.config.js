import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' => works under any path (GitHub Pages /app/)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' }
})
