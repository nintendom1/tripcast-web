import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { spawnSync } from "child_process";

export function prepareProvisioningProfileRefresh({
  applicationIdentifier,
  applicationIdentifiers = [applicationIdentifier],
  profileDir,
  readApplicationIdentifier = readProvisioningProfileApplicationIdentifier,
  temporaryDirectory = tmpdir(),
}) {
  const matchingProfiles = findProvisioningProfiles({
    applicationIdentifiers,
    profileDir,
    readApplicationIdentifier,
  });
  const backupDir =
    matchingProfiles.length > 0
      ? mkdtempSync(join(temporaryDirectory, "tripcast-ios-profile-refresh-"))
      : undefined;
  const movedProfiles = [];

  try {
    for (const profilePath of matchingProfiles) {
      const backupPath = join(backupDir, basename(profilePath));
      renameSync(profilePath, backupPath);
      movedProfiles.push({ profilePath, backupPath });
    }
  } catch (error) {
    restoreProvisioningProfiles({ backupDir, movedProfiles, profileDir });
    throw error;
  }

  return {
    applicationIdentifier,
    applicationIdentifiers,
    backupDir,
    movedProfiles,
    profileDir,
    readApplicationIdentifier,
  };
}

export function findProvisioningProfiles({
  applicationIdentifier,
  applicationIdentifiers = [applicationIdentifier],
  profileDir,
  readApplicationIdentifier = readProvisioningProfileApplicationIdentifier,
}) {
  if (!existsSync(profileDir)) return [];

  return readdirSync(profileDir)
    .filter(fileName => fileName.endsWith(".mobileprovision"))
    .map(fileName => join(profileDir, fileName))
    .filter(profilePath => applicationIdentifiers.includes(readApplicationIdentifier(profilePath)));
}

export function readProvisioningProfileApplicationIdentifier(profilePath) {
  const decodedProfile = spawnSync("security", ["cms", "-D", "-i", profilePath], {
    encoding: "utf8",
  });
  if (decodedProfile.status !== 0) return undefined;

  const applicationIdentifier = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "Entitlements.application-identifier", "raw", "-o", "-", "-"],
    {
      encoding: "utf8",
      input: decodedProfile.stdout,
    },
  );
  if (applicationIdentifier.status !== 0) return undefined;

  return applicationIdentifier.stdout.trim();
}

export function restoreProvisioningProfiles({ backupDir, movedProfiles, profileDir }) {
  mkdirSync(profileDir, { recursive: true });

  for (const { profilePath, backupPath } of movedProfiles) {
    if (existsSync(profilePath)) {
      // Restore the original even if Xcode replaced a profile at the same path.
      if (existsSync(backupPath)) renameSync(backupPath, profilePath);
    } else if (existsSync(backupPath)) {
      renameSync(backupPath, profilePath);
    }
  }

  if (backupDir) {
    rmSync(backupDir, { recursive: true, force: true });
  }
}

export function finishProvisioningProfileRefresh(profileRefresh) {
  const matchingProfiles = findProvisioningProfiles(profileRefresh);

  const identifiers = profileRefresh.applicationIdentifiers ?? [profileRefresh.applicationIdentifier];
  if (identifiers.some(identifier => !matchingProfiles.some(
    path => profileRefresh.readApplicationIdentifier(path) === identifier,
  ))) {
    restoreProvisioningProfiles(profileRefresh);
    throw new Error("Xcode completed without caching a replacement TripCast provisioning profile.");
  }

  if (profileRefresh.backupDir) {
    rmSync(profileRefresh.backupDir, { recursive: true, force: true });
  }

  return matchingProfiles[0];
}

// Only return the metadata needed for verification; never print the decoded profile.
export function readProvisioningProfileMetadata(profilePath) {
  const decoded = spawnSync("security", ["cms", "-D", "-i", profilePath], { encoding: "utf8" });
  if (decoded.status !== 0) throw new Error("Cannot decode provisioning profile.");
  const field = key => {
    const result = spawnSync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", "-"], {
      encoding: "utf8", input: decoded.stdout,
    });
    if (result.status !== 0) throw new Error(`Missing provisioning field: ${key}`);
    return result.stdout.trim();
  };
  const expiration = Date.parse(field("ExpirationDate"));
  if (!Number.isFinite(expiration)) throw new Error("Invalid provisioning expiration.");
  return {
    applicationIdentifier: field("Entitlements.application-identifier"),
    teamIdentifier: field("TeamIdentifier.0"),
    uuid: field("UUID"),
    expiresAtMs: expiration,
  };
}

export function verifyEmbeddedProvisioningProfiles({ appPath, teamId, profileRefresh, nowMs = Date.now() }) {
  const components = [
    { label: "App", bundleId: "com.tripcast.app", path: appPath },
    { label: "Lock Screen activity", bundleId: "com.tripcast.app.TripCastLiveActivity",
      path: join(appPath, "PlugIns", "TripCastLiveActivity.appex") },
  ];
  let signingTeam = teamId;
  const cachedProfiles = profileRefresh ? findProvisioningProfiles(profileRefresh).map(readProvisioningProfileMetadata) : [];
  const oldProfiles = profileRefresh ? profileRefresh.movedProfiles.map(({ backupPath }) => readProvisioningProfileMetadata(backupPath)) : [];
  return components.map(component => {
    try {
      const profile = readProvisioningProfileMetadata(join(component.path, "embedded.mobileprovision"));
      signingTeam ??= profile.teamIdentifier;
      if (profile.teamIdentifier !== signingTeam || profile.applicationIdentifier !== `${signingTeam}.${component.bundleId}`) {
        throw new Error("Provisioning identity does not match the expected bundle and team.");
      }
      const bundleId = spawnSync("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(component.path, "Info.plist")], { encoding: "utf8" });
      if (bundleId.status !== 0 || bundleId.stdout.trim() !== component.bundleId) {
        throw new Error("Missing bundle or unexpected bundle identifier.");
      }
      if (profile.expiresAtMs <= nowMs) throw new Error("Embedded provisioning profile has expired.");
      const signature = spawnSync("codesign", ["--verify", "--deep", "--strict", component.path], { encoding: "utf8" });
      const identity = spawnSync("codesign", ["--display", "--verbose=4", component.path], { encoding: "utf8" });
      if (signature.status !== 0 || identity.status !== 0 || !identity.stderr.split("\n").includes(`TeamIdentifier=${signingTeam}`)) {
        throw new Error("Bundle signature verification failed or signing team differs.");
      }
      if (profileRefresh) {
        if (!cachedProfiles.some(candidate => candidate.applicationIdentifier === profile.applicationIdentifier &&
          candidate.uuid === profile.uuid && candidate.expiresAtMs === profile.expiresAtMs)) {
          throw new Error("Embedded profile does not match a cached replacement.");
        }
        if (oldProfiles.some(old => old.applicationIdentifier === profile.applicationIdentifier && old.expiresAtMs >= profile.expiresAtMs)) {
          throw new Error("Profile renewal did not extend the previous expiration.");
        }
      }
      return { label: component.label, expiresAtMs: profile.expiresAtMs };
    } catch (error) {
      throw new Error(`${component.label}: ${error.message}`, { cause: error });
    }
  });
}
