// Builds the entry-concept prototypes into ONE self-contained HTML file
// (JS and CSS inlined) at concepts/dist/play-entry-concepts.html, so they can
// be opened on an iPad without running the app.   node concepts/build.mjs
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "dist");
await build({
  root: here, base: "./", configFile: false, logLevel: "warn",
  plugins: [react()],
  resolve: { alias: { "@": path.join(here, "../src") } },
  build: { outDir: out, emptyOutDir: true, cssCodeSplit: false, assetsInlineLimit: 1e9, modulePreload: false },
});
const assets = path.join(out, "assets");
let html = readFileSync(path.join(out, "index.html"), "utf8");
for (const f of readdirSync(assets)) {
  const body = readFileSync(path.join(assets, f), "utf8");
  if (f.endsWith(".js")) html = html.replace(new RegExp(`<script[^>]*src="\\./assets/${f}"[^>]*></script>`), () => `<script type="module">${body}</script>`);
  if (f.endsWith(".css")) html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${f}"[^>]*>`), () => `<style>${body}</style>`);
}
writeFileSync(path.join(out, "play-entry-concepts.html"), html);
console.log("wrote", path.join(out, "play-entry-concepts.html"), `${(html.length / 1024).toFixed(0)} KB`);
