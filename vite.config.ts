import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Capacitor serves assets from the app bundle root, so use a relative base
  // for native builds (`CAPACITOR=1 npm run build`). Web deploy keeps the
  // GitHub Pages subpath.
  base: process.env.CAPACITOR ? "./" : "/tripcast-web/",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
