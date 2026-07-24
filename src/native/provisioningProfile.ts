import { Capacitor, registerPlugin } from "@capacitor/core";

type ProvisioningProfilePlugin = {
  getExpiration(): Promise<{ expiresAtMs?: number }>;
};

const ProvisioningProfile = registerPlugin<ProvisioningProfilePlugin>(
  "ProvisioningProfile",
);

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function getProvisioningProfileExpiration(): Promise<number | null> {
  if (!isNativeIos()) return null;

  try {
    const result = await ProvisioningProfile.getExpiration();
    return typeof result.expiresAtMs === "number"
        && Number.isFinite(result.expiresAtMs)
        && result.expiresAtMs > 0
      ? result.expiresAtMs
      : null;
  } catch {
    return null;
  }
}
