import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tripcast.app",
  appName: "TripCast",
  // Vite build output. Build with `CAPACITOR=1 npm run build` so assets use a
  // relative base (served from the app bundle root, not `/tripcast-web/`).
  webDir: "dist",
  ios: {
    // Allow the WebView to reach the Convex backend over https.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
