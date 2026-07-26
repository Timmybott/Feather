import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Build config for the Feather web app (`web/`). Named `vite.web.config.ts`
// (not `vite.config.ts`) so svelte-check never mistakes it for the app's config
// — the desktop app keeps using the root `vite.config.ts` untouched.
const here = path.dirname(fileURLToPath(import.meta.url));
const apiWeb = path.resolve(here, "web/lib/api.web.ts");

// The web build reuses the desktop app's Svelte components unchanged. Those
// components reach the local Tauri core through `src/lib/api.ts` (`invoke(...)`),
// which doesn't exist in a browser. This plugin redirects that one module to a
// web implementation (`web/lib/api.web.ts`) reaching the panel through the
// `feather-panel` Edge Function instead — only in this build, so the installable
// app is completely unaffected.
function redirectApi() {
  return {
    name: "feather-web-api-redirect",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      if ((source === "../api" || source === "./api") && importer) {
        if (importer.replace(/\\/g, "/").includes("/src/lib/")) return apiWeb;
      }
      return null;
    },
  };
}

export default defineConfig({
  root: path.resolve(here, "web"),
  plugins: [redirectApi(), svelte()],
  build: {
    outDir: path.resolve(here, "web/dist"),
    emptyOutDir: true,
  },
});
