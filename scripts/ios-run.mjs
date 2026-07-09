import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const envFile = join(process.cwd(), ".env.capacitor.local");
const workspace = "App.xcworkspace";
const nativeProjectDir = join(process.cwd(), "ios", "App");

loadLocalEnv();

const options = parseArgs(process.argv.slice(2));
const localProjectTeamIds = readLocalProjectTeamIds();

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.list) {
  const listArgs = ["native-run", "ios", "--list"];
  if (options.json) listArgs.push("--json");
  if (options.device) listArgs.push("--device");
  if (options.virtual) listArgs.push("--virtual");
  run("npx", listArgs);
  process.exit(0);
}

const teamId = process.env.DEVELOPMENT_TEAM;
const buildsForSimulator = options.virtual || isSimulatorTarget(options.target);
const configuration = options.configuration ?? "Debug";
const scheme = options.scheme ?? "App";
const derivedDataPath = resolve("ios", "App", "DerivedData", "ios-run");
const productSdk = buildsForSimulator ? "iphonesimulator" : "iphoneos";
const appPath = join(
  derivedDataPath,
  "Build",
  "Products",
  `${configuration}-${productSdk}`,
  `${scheme}.app`,
);

console.log("\x1b[32m[TripCast iOS] Building web app and syncing Capacitor...\x1b[0m");
run("npm", ["run", "build:cap"]);
run("npx", ["cap", "sync", "ios"]);

console.log("\x1b[32m[TripCast iOS] Building native iOS app...\x1b[0m");

const xcodebuildArgs = [
  "xcodebuild",
  "-workspace",
  workspace,
  "-scheme",
  scheme,
  "-configuration",
  configuration,
  "-destination",
  buildDestination(options, buildsForSimulator),
  "-derivedDataPath",
  derivedDataPath,
  "-allowProvisioningUpdates",
];

if (teamId) {
  console.log(`\x1b[32mUsing Development Team: ${teamId}\x1b[0m`);
  warnIfLocalProjectTeamDiffers(teamId, localProjectTeamIds);
  xcodebuildArgs.push(`DEVELOPMENT_TEAM=${teamId}`);
} else {
  console.log("\x1b[33mWarning: DEVELOPMENT_TEAM is not set in .env.capacitor.local or the shell.\x1b[0m");
  console.log("Automatic signing may fail unless Xcode already has a valid local signing team.");
  if (localProjectTeamIds.length > 0) {
    console.log(
      "\x1b[33mXcode has written a local DEVELOPMENT_TEAM into the project file. Move that value to .env.capacitor.local and remove the project-file change before committing.\x1b[0m",
    );
  }
}

run("xcrun", xcodebuildArgs, { cwd: nativeProjectDir });

console.log("\x1b[32m[TripCast iOS] Deploying to device...\x1b[0m");

const nativeRunArgs = ["native-run", "ios", "--app", appPath];

if (options.target) {
  nativeRunArgs.push("--target", options.target);
} else if (buildsForSimulator) {
  nativeRunArgs.push("--virtual");
} else {
  nativeRunArgs.push("--device");
}

if (options.connect) nativeRunArgs.push("--connect");

run("npx", nativeRunArgs);

function loadLocalEnv() {
  if (!existsSync(envFile)) return;

  const content = readFileSync(envFile, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2] ?? "";

    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);

    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(args) {
  const parsed = {
    help: false,
    list: false,
    json: false,
    device: false,
    virtual: false,
    connect: false,
    target: undefined,
    scheme: undefined,
    configuration: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--list") parsed.list = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--device") parsed.device = true;
    else if (arg === "--virtual") parsed.virtual = true;
    else if (arg === "--connect") parsed.connect = true;
    else if (arg === "--target") parsed.target = readValue(args, ++index, "--target");
    else if (arg.startsWith("--target=")) parsed.target = arg.slice("--target=".length);
    else if (arg === "--scheme") parsed.scheme = readValue(args, ++index, "--scheme");
    else if (arg.startsWith("--scheme=")) parsed.scheme = arg.slice("--scheme=".length);
    else if (arg === "--configuration") parsed.configuration = readValue(args, ++index, "--configuration");
    else if (arg.startsWith("--configuration=")) parsed.configuration = arg.slice("--configuration=".length);
    else {
      console.error(`Unsupported ios:run argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (parsed.device && parsed.virtual) {
    console.error("Choose either --device or --virtual, not both.");
    process.exit(1);
  }

  return parsed;
}

function readValue(args, index, optionName) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    console.error(`${optionName} requires a value.`);
    process.exit(1);
  }

  return value;
}

function buildDestination(options, buildsForSimulator) {
  if (options.target) return `id=${options.target}`;
  if (buildsForSimulator) return "generic/platform=iOS Simulator";
  return "generic/platform=iOS";
}

function isSimulatorTarget(target) {
  if (!target) return false;

  const result = spawnSync("xcrun", ["simctl", "list", "devices", "--json"], {
    encoding: "utf8",
  });

  if (result.status !== 0) return false;

  try {
    const payload = JSON.parse(result.stdout);
    return Object.values(payload.devices ?? {})
      .flat()
      .some(device => device.udid === target);
  } catch {
    return false;
  }
}

function readLocalProjectTeamIds() {
  const projectFile = join(nativeProjectDir, "App.xcodeproj", "project.pbxproj");
  if (!existsSync(projectFile)) return [];

  const content = readFileSync(projectFile, "utf8");
  return Array.from(content.matchAll(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/g), match => match[1])
    .filter((teamId, index, teamIds) => teamIds.indexOf(teamId) === index);
}

function warnIfLocalProjectTeamDiffers(teamId, projectTeamIds) {
  if (projectTeamIds.length === 0 || projectTeamIds.includes(teamId)) return;

  console.log(
    "\x1b[33mWarning: .env.capacitor.local is using a different DEVELOPMENT_TEAM than the one Xcode just wrote into the project file.\x1b[0m",
  );
  console.log(
    "\x1b[33mIf xcodebuild reports \"No Account for Team\", update DEVELOPMENT_TEAM to the Team ID shown for your Personal Team in Xcode.\x1b[0m",
  );
}

function run(command, args, options = {}) {
  console.log(`\x1b[36m> ${command} ${args.join(" ")}\x1b[0m`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printHelp() {
  console.log(`Usage: npm run ios:run -- [options]

Builds the Capacitor web app, syncs iOS, builds the native app with
-allowProvisioningUpdates, then deploys with native-run.

Options:
  --target <id>              Deploy to a specific iOS device or simulator.
  --list                     List native-run iOS targets and exit.
  --json                     Output JSON with --list.
  --device                   Prefer a physical iOS device.
  --virtual                  Build and deploy to a simulator.
  --connect                  Tie native-run to the app process.
  --scheme <name>            Xcode scheme. Defaults to App.
  --configuration <name>     Xcode configuration. Defaults to Debug.
  -h, --help                 Show this help.
`);
}
