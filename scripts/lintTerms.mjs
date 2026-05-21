#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg?.split("=")[1] ?? (args.has("--report") ? "report" : args.has("--baseline") ? "baseline" : "enforce");
const configPath = valueAfter("--config") ?? "terminology.config.json";
const baselinePath = valueAfter("--baseline-file") ?? "terminology-baseline.json";
const configFilePath = path.resolve(process.cwd(), configPath);
const rootDir = path.dirname(configFilePath);

function valueAfter(flag) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function normalizeRootedPath(filePath) {
  const rel = path.relative(rootDir, filePath);
  return toPosix(rel);
}

function globToRegExp(glob) {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    const next = glob[i + 1];
    if (c === "*" && next === "*") {
      out += ".*";
      i++;
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += ".";
    } else {
      out += c.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

function matchesGlob(filePath, glob) {
  return globToRegExp(glob).test(filePath);
}

function shouldExclude(filePath, excludes) {
  return excludes.some((glob) => matchesGlob(filePath, glob));
}

function walk(target, excludes, files = []) {
  const absoluteTarget = path.resolve(rootDir, target);
  if (!fs.existsSync(absoluteTarget)) return files;
  const stat = fs.statSync(absoluteTarget);
  const rel = normalizeRootedPath(absoluteTarget);
  if (shouldExclude(rel, excludes)) return files;
  if (stat.isFile()) {
    if (!isBinaryLike(absoluteTarget)) files.push(absoluteTarget);
    return files;
  }
  if (!stat.isDirectory()) return files;
  for (const entry of fs.readdirSync(absoluteTarget)) {
    walk(path.join(target, entry), excludes, files);
  }
  return files;
}

function isBinaryLike(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".zip", ".pdf"].includes(ext);
}

function isAllowed(finding, allowlist) {
  return allowlist.some((entry) => {
    const ruleMatches = entry.ruleId === "*" || entry.ruleId === finding.ruleId;
    const pathMatches = !entry.path || matchesGlob(finding.path, entry.path);
    const lineMatches = !entry.lineContains || finding.excerpt.includes(entry.lineContains);
    return ruleMatches && pathMatches && lineMatches;
  });
}

function suppressionRuleIds(line, directive) {
  const idx = line.indexOf(directive);
  if (idx === -1) return null; // directive not present
  const rest = line.slice(idx + directive.length).trim();
  return rest ? rest.split(/[\s,]+/).filter(Boolean) : []; // [] = suppress all
}

function isSuppressed(lines, index, ruleId) {
  const cur = lines[index] ?? "";
  // A standalone next-line directive comment is lint-control metadata. Its
  // rule-id args can themselves embed a banned term, so never flag the
  // directive line itself.
  if (cur.includes("term-lint-disable-next-line")) return true;
  const checks = [
    [lines[index - 1] ?? "", "term-lint-disable-next-line"],
    [cur, "term-lint-disable-line"],
  ];
  for (const [line, directive] of checks) {
    const ids = suppressionRuleIds(line, directive);
    if (ids === null) continue;
    if (ids.length === 0 || ids.includes(ruleId)) return true;
  }
  return false;
}

function fingerprint(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function findingKey(finding) {
  return `${finding.ruleId}|${finding.path}|${finding.line}|${finding.term}|${fingerprint(finding.excerpt.trim())}`;
}

function findingStableKey(finding) {
  return `${finding.ruleId}|${finding.path}|${finding.term}|${fingerprint(finding.excerpt.trim())}`;
}

function scan(config) {
  const findings = [];
  const rules = config.rules.map((rule) => ({
    ...rule,
    regexp: new RegExp(rule.pattern, "g"),
  }));
  const files = config.scanRoots.flatMap((scanRoot) => walk(scanRoot, config.exclude ?? []));
  for (const file of files) {
    const relative = normalizeRootedPath(file);
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((lineText, index) => {
      for (const rule of rules) {
        rule.regexp.lastIndex = 0;
        let match;
        while ((match = rule.regexp.exec(lineText)) !== null) {
          const finding = {
            ruleId: rule.id,
            term: match[0],
            replacement: rule.replacement,
            category: rule.category,
            reason: rule.reason,
            path: relative,
            line: index + 1,
            excerpt: lineText.trim(),
          };
          if (
            !isAllowed(finding, config.allowlist ?? []) &&
            !isSuppressed(lines, index, finding.ruleId)
          ) {
            findings.push({ ...finding, key: findingKey(finding) });
          }
          if (match[0].length === 0) rule.regexp.lastIndex++;
        }
      }
    });
  }
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));
}

function printFindings(findings, heading = "Terminology findings") {
  console.log(`${heading}: ${findings.length}`);
  for (const finding of findings) {
    console.log(
      `${finding.path}:${finding.line} [${finding.category}] ${finding.term} -> ${finding.replacement} (${finding.ruleId})`,
    );
    console.log(`  ${finding.excerpt}`);
    if (finding.reason) console.log(`  Reason: ${finding.reason}`);
  }
}

function writeBaseline(findings) {
  const baseline = {
    generatedAt: new Date().toISOString(),
    note: "Existing terminology debt allowed by npm run lint:terms. Remove entries as slices are cleaned.",
    findings: findings.map(({ key, ruleId, term, replacement, category, reason, path: filePath, line, excerpt }) => ({
      key,
      ruleId,
      term,
      replacement,
      category,
      reason,
      path: filePath,
      line,
      excerpt,
    })),
  };
  fs.writeFileSync(path.resolve(rootDir, baselinePath), `${JSON.stringify(baseline, null, 2)}\n`);
}

function readBaselineStableCounts() {
  const absolute = path.resolve(rootDir, baselinePath);
  if (!fs.existsSync(absolute)) return new Map();
  const baseline = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const counts = new Map();
  for (const finding of baseline.findings ?? []) {
    const key = findingStableKey(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const config = readJson(configPath);
const findings = scan(config);

if (mode === "report") {
  printFindings(findings);
  process.exit(0);
}

if (mode === "baseline") {
  writeBaseline(findings);
  printFindings(findings, `Wrote ${baselinePath}`);
  process.exit(0);
}

if (mode !== "enforce") {
  console.error(`Unknown terminology lint mode: ${mode}`);
  process.exit(2);
}

const baselineStableCounts = readBaselineStableCounts();
const newFindings = [];
for (const finding of findings) {
  const key = findingStableKey(finding);
  const remaining = baselineStableCounts.get(key) ?? 0;
  if (remaining > 0) {
    baselineStableCounts.set(key, remaining - 1);
  } else {
    newFindings.push(finding);
  }
}
if (newFindings.length > 0) {
  printFindings(newFindings, "New terminology violations");
  process.exit(1);
}

console.log(`Terminology lint passed: ${findings.length} baseline finding(s), 0 new violation(s).`);
