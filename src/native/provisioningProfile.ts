import { Capacitor, registerPlugin } from "@capacitor/core";

type ProvisioningProfilePlugin = {
  getExpiration(): Promise<{
    expiresAtMs?: number;
    activityExpiresAtMs?: number;
    activityProfileStatus?: string;
    activityExtensionPresent?: boolean;
  }>;
};

export type ActivityProfileDiagnostics = {
  expiresAtMs: number | null;
  status: "available" | "missing" | "unreadable" | "unknown";
  extensionPresent?: boolean;
};

export type ProvisioningProfileDiagnostics = {
  expiresAtMs: number | null;
  activityProfile?: ActivityProfileDiagnostics;
};

const ProvisioningProfile = registerPlugin<ProvisioningProfilePlugin>(
  "ProvisioningProfile",
);

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function getProvisioningProfileExpiration(): Promise<number | null> {
  return (await getProvisioningProfileDiagnostics()).expiresAtMs;
}

function validExpiration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function getProvisioningProfileDiagnostics(): Promise<ProvisioningProfileDiagnostics> {
  const unavailable = { expiresAtMs: null };
  if (!isNativeIos()) return unavailable;

  try {
    const result = await ProvisioningProfile.getExpiration();
    const status = result.activityProfileStatus;
    const activityProfile: ActivityProfileDiagnostics | undefined = status === undefined ? undefined : {
      expiresAtMs: validExpiration(result.activityExpiresAtMs),
      status: status === "available" || status === "missing" || status === "unreadable" ? status : "unknown",
      extensionPresent: result.activityExtensionPresent,
    };
    return { expiresAtMs: validExpiration(result.expiresAtMs), activityProfile };
  } catch {
    return unavailable;
  }
}
