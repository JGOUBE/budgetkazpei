import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    entries: ["index.html"],
  },

  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/android/**", "**/dist/**"],
    },
  },
})
