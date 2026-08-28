import { defineConfig } from "vite";

/**
 * Build the embeddable widget as a single self-executing bundle.
 *
 * The package declared a `vite build` script but shipped no config, so there
 * was nothing describing the artifact customers are told to embed.
 *
 * TRES_API_BASE is baked in here rather than read at runtime: the script is
 * served from a CDN to arbitrary pages, so there is no environment to read
 * from. An individual embed can still override it with data-api-base.
 */
export default defineConfig({
  define: {
    __TRES_API_BASE__: JSON.stringify(
      process.env.TRES_API_BASE || "https://api.trescrm.com"
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/index.ts",
      name: "TresCRM",
      formats: ["iife"],
      fileName: () => "tres-widget.js",
    },
    // The widget lands on other people's pages; keep it small and self-contained.
    minify: "esbuild",
    sourcemap: true,
  },
});
