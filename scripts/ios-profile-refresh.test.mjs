// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findProvisioningProfiles,
  finishProvisioningProfileRefresh,
  prepareProvisioningProfileRefresh,
  restoreProvisioningProfiles,
} from "./ios-profile-refresh.mjs";

const TRIPCAST_APPLICATION_IDENTIFIER = "TEAM123456.com.tripcast.app";

describe("iOS provisioning profile refresh", () => {
  let testDir;
  let profileDir;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "tripcast-ios-profile-test-"));
    profileDir = join(testDir, "profiles");
    mkdirSync(profileDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("selects only mobileprovision files for the TripCast application identifier", () => {
    const matchingProfile = createProfile(
      "matching.mobileprovision",
      TRIPCAST_APPLICATION_IDENTIFIER,
    );
    createProfile("other.mobileprovision", "TEAM123456.com.example.other");
    createProfile("matching.mobileprovision.backup", TRIPCAST_APPLICATION_IDENTIFIER);

    expect(findProfiles()).toEqual([matchingProfile]);
  });

  it("temporarily moves matching cached profiles without touching other apps", () => {
    const matchingProfile = createProfile(
      "matching.mobileprovision",
      TRIPCAST_APPLICATION_IDENTIFIER,
    );
    const otherProfile = createProfile("other.mobileprovision", "TEAM123456.com.example.other");

    const refresh = prepareRefresh();

    expect(existsSync(matchingProfile)).toBe(false);
    expect(existsSync(refresh.movedProfiles[0].backupPath)).toBe(true);
    expect(existsSync(otherProfile)).toBe(true);
  });

  it("restores the cached profile when the native build fails", () => {
    const matchingProfile = createProfile(
      "matching.mobileprovision",
      TRIPCAST_APPLICATION_IDENTIFIER,
    );
    const refresh = prepareRefresh();

    restoreProvisioningProfiles(refresh);

    expect(readFileSync(matchingProfile, "utf8")).toBe(TRIPCAST_APPLICATION_IDENTIFIER);
    expect(existsSync(refresh.backupDir)).toBe(false);
  });

  it("discards the temporary backup after Xcode caches a replacement", () => {
    createProfile("old.mobileprovision", TRIPCAST_APPLICATION_IDENTIFIER);
    const refresh = prepareRefresh();
    const replacementProfile = createProfile(
      "replacement.mobileprovision",
      TRIPCAST_APPLICATION_IDENTIFIER,
    );

    expect(finishProvisioningProfileRefresh(refresh)).toBe(replacementProfile);
    expect(existsSync(refresh.backupDir)).toBe(false);
  });

  it("restores the previous profile when Xcode does not cache a replacement", () => {
    const matchingProfile = createProfile(
      "matching.mobileprovision",
      TRIPCAST_APPLICATION_IDENTIFIER,
    );
    const refresh = prepareRefresh();

    expect(() => finishProvisioningProfileRefresh(refresh)).toThrow(
      "Xcode completed without caching a replacement TripCast provisioning profile.",
    );
    expect(existsSync(matchingProfile)).toBe(true);
    expect(existsSync(refresh.backupDir)).toBe(false);
  });

  function createProfile(fileName, applicationIdentifier) {
    const profilePath = join(profileDir, fileName);
    writeFileSync(profilePath, applicationIdentifier, { flag: "wx" });
    return profilePath;
  }

  function readApplicationIdentifier(profilePath) {
    return readFileSync(profilePath, "utf8");
  }

  function findProfiles() {
    return findProvisioningProfiles({
      applicationIdentifier: TRIPCAST_APPLICATION_IDENTIFIER,
      profileDir,
      readApplicationIdentifier,
    });
  }

  function prepareRefresh() {
    return prepareProvisioningProfileRefresh({
      applicationIdentifier: TRIPCAST_APPLICATION_IDENTIFIER,
      profileDir,
      readApplicationIdentifier,
      temporaryDirectory: testDir,
    });
  }
});
