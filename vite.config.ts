import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Optional same-origin proxy; UI talks to http://127.0.0.1:3847 via CORS by default.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:3847",
        ws: true,
      },
    },
  },
  // Relative base so packaged Electron can load assets via file://
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
