const DEFAULT_PUBLIC_APP_URL = "https://nintendom1.github.io/tripcast-web/";

function ensureTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

export function getPublicAppUrl() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configured) return ensureTrailingSlash(configured);

  if (import.meta.env.PROD && import.meta.env.BASE_URL === "./") {
    return DEFAULT_PUBLIC_APP_URL;
  }

  return ensureTrailingSlash(new URL(import.meta.env.BASE_URL, window.location.origin).toString());
}
