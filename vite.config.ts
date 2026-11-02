import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './', // ช่วยให้รันได้ทั้งบน Local และ GitHub Pages โดยไม่ต้องแก้ path
})
