import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  base: "/causal-proof/",
  build: {
    outDir: path.resolve(__dirname, "../out/showcase"),
    emptyOutDir: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
