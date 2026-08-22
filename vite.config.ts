import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon.ico", "favicon-48.png"],
      manifest: {
        name: "Dragon Stats",
        short_name: "Dragon Stats",
        description: "High school football play-by-play tracking and stats.",
        theme_color: "#dc2626",
        background_color: "#070a0f",
        display: "standalone",
        // Landscape is the useful orientation on a press-box tablet — the
        // game screen lays out in two columns there. Locking to portrait
        // would make that unreachable once installed to the home screen.
        orientation: "any",
        start_url: "/",
        scope: "/",
        // PNG rather than SVG: Android's launcher and the install prompt are
        // fussy about SVG icons, and these are generated from the dragon at
        // fixed sizes anyway. The maskable copy is inset to the ~80% safe
        // zone so a circular crop doesn't cut the wings off.
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache app shell + assets; network-first for Supabase API.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/rest\//, /supabase\.co/],
        runtimeCaching: [
          {
            // Supabase REST / auth / realtime — network-first, fall back to cache if offline.
            // We never serve stale auth/data when the network is up.
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/.*/i,
            handler: "NetworkOnly",
            options: {
              backgroundSync: {
                name: "supabase-bg-sync",
                options: { maxRetentionTime: 24 * 60 }, // minutes
              },
            },
          },
          {
            // Static assets in /assets/ — cache-first
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "dragonstats-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        // Enables the SW in `vite dev` so we can test installability locally.
        enabled: false, // flip to true when actively testing PWA behavior in dev
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5174,
  },
});
