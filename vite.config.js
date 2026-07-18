import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: projectRoot,
  plugins: [react()],

  optimizeDeps: {
    entries: ["index.html"],
    include: ["tesseract.js"],
  },

  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/android/**", "**/dist/**"],
    },
  },
})
