import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/dragonstats/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-maskable.svg"],
      manifest: {
        name: "Dragon Stats",
        short_name: "Dragon Stats",
        description: "High school football play-by-play tracking and stats.",
        theme_color: "#dc2626",
        background_color: "#070a0f",
        display: "standalone",
        orientation: "portrait",
        start_url: "/dragonstats/",
        scope: "/dragonstats/",
        icons: [
          { src: "icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
          { src: "icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache app shell + assets; network-first for Supabase API.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        navigateFallback: "/dragonstats/index.html",
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
            // Static assets in /dragonstats/assets/ — cache-first
            urlPattern: ({ url }) => url.pathname.startsWith("/dragonstats/assets/"),
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
