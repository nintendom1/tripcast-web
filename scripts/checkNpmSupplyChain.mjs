import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const lockfilePath = path.join(repoRoot, "package-lock.json");

const deniedVersions = new Map(
  Object.entries({
    "@mistralai/mistralai": ["2.2.3", "2.2.4"],
    "@mistralai/mistralai-azure": ["1.7.2", "1.7.3"],
    "@mistralai/mistralai-gcp": ["1.7.2", "1.7.3"],
    "@opensearch-project/opensearch": ["3.6.2"],
    "@tanstack/react-router": ["1.169.5", "1.169.8"],
    "@tanstack/router-core": ["1.169.5", "1.169.8"],
    "@tanstack/router-plugin": ["1.167.38", "1.167.41"],
    "@tanstack/router-vite-plugin": ["1.166.53", "1.166.56"],
    "@tanstack/router-generator": ["1.166.45", "1.166.48"],
    "@tanstack/router-cli": ["1.166.46", "1.166.49"],
    "@tanstack/router-utils": ["1.161.11", "1.161.14"],
    "@tanstack/history": ["1.161.9", "1.161.12"],
    "@tanstack/virtual-file-routes": ["1.161.10", "1.161.13"],
    "@tanstack/zod-adapter": ["1.166.12", "1.166.15"],
    "@tanstack/valibot-adapter": ["1.166.12", "1.166.15"],
    "@tanstack/arktype-adapter": ["1.166.12", "1.166.15"],
    "@uipath/agent-sdk": ["1.0.2"],
    "@uipath/agent.sdk": ["0.0.18"],
    "@uipath/agent-tool": ["1.0.1"],
    "@uipath/llmgw-tool": ["1.0.1"],
    "@draftauth/client": ["0.2.1", "0.2.2"],
    "@draftauth/core": ["0.13.1", "0.13.2"],
    "@draftlab/auth": ["0.24.1", "0.24.2"],
    "@draftlab/db": ["0.16.1", "0.16.2"],
    "@dirigible-ai/sdk": ["0.6.2", "0.6.3"],
    "agentwork-cli": ["0.1.4", "0.1.5"],
    "cmux-agent-mcp": ["0.1.3", "0.1.4", "0.1.5", "0.1.6", "0.1.7", "0.1.8"],
    "nextmove-mcp": ["0.1.3", "0.1.4", "0.1.5", "0.1.7"],
    "safe-action": ["0.8.3", "0.8.4"],
  }).map(([name, versions]) => [name, new Set(versions)]),
);

const allowedInstallScriptPackages = new Set(["esbuild", "fsevents", "msw"]);
const untrustedSpecPattern = /^(?:github:|git(?:\+https|\+ssh)?:|https?:\/\/|file:|link:)/i;
const untrustedResolvedPattern = /^(?:github:|git(?:\+https|\+ssh)?:|file:|link:)/i;
const registryTarballPattern = /^https:\/\/registry\.npmjs\.org\//i;
const findings = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function dependencyNameFromLockPath(lockPath) {
  const parts = lockPath.split("/");
  const nodeModulesIndex = parts.lastIndexOf("node_modules");
  if (nodeModulesIndex === -1) {
    return null;
  }

  const firstPart = parts[nodeModulesIndex + 1];
  if (!firstPart) {
    return null;
  }

  if (firstPart.startsWith("@")) {
    const secondPart = parts[nodeModulesIndex + 2];
    return secondPart ? `${firstPart}/${secondPart}` : null;
  }

  return firstPart;
}

function normalizedExactVersion(spec) {
  return String(spec).replace(/^[~^=<> ]+/, "").split(" ")[0];
}

function checkDependencySpecs(source, dependencies = {}) {
  for (const [name, spec] of Object.entries(dependencies)) {
    if (untrustedSpecPattern.test(String(spec))) {
      findings.push(`${source}: ${name} uses a non-registry dependency spec (${spec})`);
    }

    const denied = deniedVersions.get(name);
    if (denied?.has(normalizedExactVersion(spec))) {
      findings.push(`${source}: ${name}@${spec} matches a known compromised version`);
    }
  }
}

const packageJson = readJson(packageJsonPath);
checkDependencySpecs("package.json dependencies", packageJson.dependencies);
checkDependencySpecs("package.json devDependencies", packageJson.devDependencies);
checkDependencySpecs("package.json optionalDependencies", packageJson.optionalDependencies);

const lockfile = readJson(lockfilePath);
for (const [lockPath, entry] of Object.entries(lockfile.packages ?? {})) {
  const packageName = dependencyNameFromLockPath(lockPath);
  if (!packageName) {
    continue;
  }

  if (
    entry.resolved &&
    (untrustedResolvedPattern.test(entry.resolved) ||
      (/^https?:\/\//i.test(entry.resolved) && !registryTarballPattern.test(entry.resolved)))
  ) {
    findings.push(`${lockPath}: resolved from a non-registry source (${entry.resolved})`);
  }

  const denied = deniedVersions.get(packageName);
  if (denied?.has(entry.version)) {
    findings.push(`${lockPath}: ${packageName}@${entry.version} matches a known compromised version`);
  }

  if (entry.optionalDependencies?.["@tanstack/setup"]) {
    findings.push(`${lockPath}: includes the Mini Shai-Hulud @tanstack/setup optional dependency vector`);
  }

  checkDependencySpecs(`${lockPath} dependencies`, entry.dependencies);
  checkDependencySpecs(`${lockPath} optionalDependencies`, entry.optionalDependencies);

  if (entry.hasInstallScript === true && !allowedInstallScriptPackages.has(packageName)) {
    findings.push(`${lockPath}: ${packageName} has an install lifecycle script and is not allowlisted`);
  }
}

if (findings.length > 0) {
  console.error("Supply-chain guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Supply-chain guard passed.");
