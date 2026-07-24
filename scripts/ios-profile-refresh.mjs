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
  profileDir,
  readApplicationIdentifier = readProvisioningProfileApplicationIdentifier,
  temporaryDirectory = tmpdir(),
}) {
  const matchingProfiles = findProvisioningProfiles({
    applicationIdentifier,
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
    backupDir,
    movedProfiles,
    profileDir,
    readApplicationIdentifier,
  };
}

export function findProvisioningProfiles({
  applicationIdentifier,
  profileDir,
  readApplicationIdentifier = readProvisioningProfileApplicationIdentifier,
}) {
  if (!existsSync(profileDir)) return [];

  return readdirSync(profileDir)
    .filter(fileName => fileName.endsWith(".mobileprovision"))
    .map(fileName => join(profileDir, fileName))
    .filter(profilePath => readApplicationIdentifier(profilePath) === applicationIdentifier);
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
      rmSync(backupPath, { force: true });
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

  if (matchingProfiles.length === 0) {
    restoreProvisioningProfiles(profileRefresh);
    throw new Error("Xcode completed without caching a replacement TripCast provisioning profile.");
  }

  if (profileRefresh.backupDir) {
    rmSync(profileRefresh.backupDir, { recursive: true, force: true });
  }

  return matchingProfiles[0];
}
