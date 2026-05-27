import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tripcast.app",
  appName: "TripCast",
  // Vite build output. Use `npm run ios:run` / `ios:sync`, which build with
  // `--mode capacitor` so assets use a relative base (served from the app
  // bundle root, not `/tripcast-web/`) and load `.env.capacitor.local`.
  webDir: "dist",
  ios: {
    // Allow the WebView to reach the Convex backend over https.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
