import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // Native builds run `vite build --mode capacitor`, which also loads
  // `.env.capacitor.local` (where the prod VITE_CONVEX_URL lives) and serves
  // assets from the app-bundle root. Web deploy keeps the GitHub Pages subpath.
  base: mode === "capacitor" ? "./" : "/tripcast-web/",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
