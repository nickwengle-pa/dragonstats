import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/dragonstats/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
