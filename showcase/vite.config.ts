import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  base: "/causal-proof/",
  plugins: [{
    name: "normalize-showcase-html",
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === "asset" && asset.fileName === "index.html" && typeof asset.source === "string") asset.source = asset.source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      }
    },
  }],
  build: {
    outDir: path.resolve(__dirname, "../out/showcase"),
    emptyOutDir: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
