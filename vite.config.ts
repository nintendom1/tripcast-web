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
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          // Match on path boundaries, specific-before-generic. React itself is
          // left in the catch-all `vendor` chunk on purpose: manually isolating
          // it buys little (it is small next to MapLibre) and risks chunk
          // init-order failures.
          if (id.includes("/node_modules/maplibre-gl/")) return "vendor-map";
          if (id.includes("/node_modules/framer-motion/")) return "vendor-framer";
          if (id.includes("/node_modules/convex/")) return "vendor-convex";
          if (id.includes("/node_modules/lucide-react/") || id.includes("/node_modules/@base-ui/")) return "vendor-ui";
          return "vendor";
        },
      },
    },
  },
}));
