import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    // Sale directo a public para servirlo estático
    outDir: "public/scripts",
    emptyOutDir: false, // no borra otras cosas de public
    sourcemap: true,
    rollupOptions: {
      input: {
        "content-editor": resolve(__dirname, "src/scripts/content-editor.ts"),
        "post-edit": resolve(__dirname, "src/scripts/post-edit.ts"),
      },
      output: {
        // Nombres fijos (sin hash) para que no tengas que cambiar HTML
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "es",
      },
    },
  },
});
