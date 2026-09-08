import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/frontend"),
  publicDir: path.resolve(__dirname, "src/frontend/public"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/frontend"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/frontend/index.html"),
        "matter-apple-card": path.resolve(__dirname, "src/frontend/src/cards/matter-apple-card.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "matter-apple-card") {
            return "matter-apple-card.js";
          }
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/custom": "http://localhost:8099",
    },
  },
});
