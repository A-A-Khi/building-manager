import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Accept NEXT_PUBLIC_ vars already set on Vercel (Next.js convention)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})