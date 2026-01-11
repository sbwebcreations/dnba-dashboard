import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use /dnba-dashboard/ for GitHub Pages, / for Vercel
const base = process.env.GITHUB_PAGES === 'true' ? '/dnba-dashboard/' : '/'

export default defineConfig({
  plugins: [react()],
  base,
})
