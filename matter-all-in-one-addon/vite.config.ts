import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/frontend"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/frontend"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: path.resolve(__dirname, "src/frontend/index.html"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8099",
      "/status": "http://localhost:8099",
      "/devices": "http://localhost:8099",
      "/cameras": "http://localhost:8099",
      "/scrypted": "http://localhost:8099",
    },
  },
});
