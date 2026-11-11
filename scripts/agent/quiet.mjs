import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative, resolve } from "node:path";
import { ROOT, flagValue, isMain, wantsHelp } from "./lib.mjs";

const HELP = `quiet: runs the validate steps in order and prints one line on success.
  npm run v [-- --fast] [-- --no-retry] [-- --files a.ts,b.ts] [-- --step <name>]
Steps come from package.json "validate" (terms, tsc, eslint, vitest). Failure prints FAIL <step>,
that step's useful lines (60 max) and the full log path under .orchestration/logs/.
--files runs vitest related for those files (node project); --fast runs vitest with --project=node only
(skips the Playwright storybook project); --step runs one step; exit 1 on failure.
A failing vitest step re-runs only its failed files once, serially, in the project they failed in (stories -> storybook,
else node). If all pass the line says "green only on isolated re-run: <files>"; --no-retry disables the re-run.`;

const MAX_LINES = 60;
const MAX_MESSAGE_LINES = 6;

function stepName(cmd, script) {
  if (/\btsc\b/.test(cmd)) return "tsc";
  if (/\bvitest\b/.test(cmd)) return "vitest";
  if (/\beslint\b/.test(cmd)) return "eslint";
  if (/lintTerms/.test(cmd)) return "terms";
  return (script ?? cmd.split(/\s+/)[0]).replace(/:/g, "-");
}

/** Steps of `validate`, with `npm run <script>` expanded to the script's own command. */
export function stepsFromPackage(pkg) {
  return pkg.scripts.validate.split("&&").map((part) => {
    const cmd = part.trim();
    const script = cmd.match(/^npm run (\S+)$/)?.[1];
    const real = script ? pkg.scripts[script] : cmd;
    return { name: stepName(real, script), cmd: real };
  });
}

const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

const meaningful = (output) => output.split("\n").filter((l) => l.trim() !== "" && !/^(> |npm )/.test(l));

export function tscErrors(output) {
  const kept = [];
  let inError = false;
  for (const line of output.split("\n")) {
    if (/: error TS\d+/.test(line)) {
      inError = true;
      kept.push(line);
    } else if (inError && /^\s+\S/.test(line)) {
      kept.push(line);
    } else {
      inError = false;
    }
  }
  return kept;
}

function repoFrame(line, root) {
  const match = line.match(/(?:file:\/\/)?(\/[^\s()]+?):(\d+):\d+/);
  if (!match || !match[1].startsWith(`${root}/`) || match[1].includes("/node_modules/")) return undefined;
  return `${relative(root, match[1])}:${match[2]}`;
}

/** Assertion message lines, then the first stack frame inside the repo (the test file line). */
export function messageLines(message, root = ROOT) {
  const lines = [];
  let frame;
  for (const line of String(message ?? "").split("\n")) {
    if (/^\s+at /.test(line)) frame ??= repoFrame(line, root);
    else if (line.trim() !== "") lines.push(`    ${line.trim()}`);
  }
  const shown = lines.slice(0, MAX_MESSAGE_LINES);
  return frame ? [...shown, `    at ${frame}`] : shown;
}

/** `file:line rule message` per eslint problem from its JSON report (errors only; warnings do not fail). */
export function eslintFailures(results, root = ROOT) {
  const lines = [];
  for (const file of results) {
    for (const m of file.messages) {
      if (m.severity !== 2) continue;
      lines.push(`${relative(root, file.filePath)}:${m.line} ${m.ruleId ?? "parse"} ${String(m.message).split("\n")[0]}`);
    }
  }
  return lines;
}

/** Output lines to show when no structured failure was found; vitest skips passing-test lines and starts at the first error. */
export function fallbackLines(output, name) {
  const lines = meaningful(output);
  if (name !== "vitest") return lines;
  const failing = lines.filter((l) => !/^\s*✓/.test(l));
  const first = failing.findIndex((l) => /Unhandled|Error|FAIL/.test(l));
  return first === -1 ? failing : failing.slice(first);
}

/** At most `budget` lines; the last one counts what was cut. */
export function clipLines(lines, budget) {
  if (lines.length <= budget) return lines;
  return [...lines.slice(0, budget - 1), `… ${lines.length - budget + 1} more (see log)`];
}

/** Failing test names with their assertion messages from vitest's JSON report. */
export function vitestFailures(report, root = ROOT) {
  const lines = [`${report.numFailedTests} failed, ${report.numPassedTests} passed`];
  for (const suite of report.testResults) {
    const file = relative(root, suite.name);
    const failed = suite.assertionResults.filter((t) => t.status === "failed");
    if (failed.length === 0 && suite.status === "failed") lines.push(`✗ ${file} (suite failed)`, ...messageLines(suite.message, root));
    for (const test of failed) lines.push(`✗ ${file} > ${test.fullName}`, ...messageLines(test.failureMessages?.[0], root));
  }
  return lines;
}

export function vitestSummary(report) {
  const skipped = report.numPendingTests + (report.numTodoTests ?? 0);
  return `${report.numPassedTests}✓${skipped > 0 ? ` ${skipped} skipped` : ""}`;
}

/** Files with a failed test or a failed suite in vitest's JSON report, repo-relative. */
export function failedFiles(report, root = ROOT) {
  return report.testResults.filter((s) => s.status === "failed" || s.assertionResults.some((t) => t.status === "failed")).map((s) => relative(root, s.name));
}

/** Stories only exist in the Playwright-backed `storybook` project; everything else runs in `node`. */
export const projectOf = (file) => (/\.stories\.[tj]sx?$/.test(file) ? "storybook" : "node");

/** OK label when a failing vitest step went green on an isolated re-run; the re-run is never hidden. */
export function retriedLabel(passed, files, elapsed) {
  const n = files.length;
  return `vitest ${passed}✓ ${elapsed} (${n} file${n === 1 ? "" : "s"} green only on isolated re-run: ${files.join(", ")})`;
}

const seconds = (ms) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);

function execShell(cmd) {
  return spawnSync("sh", ["-c", `${cmd} 2>&1`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, PATH: `${join(ROOT, "node_modules/.bin")}${delimiter}${process.env.PATH}`, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
}

/** Re-runs failed files once, one worker, per project. `{ passed, stillFailing: lines, files, output }`. */
function retryFailed(failed, jsonFile) {
  const byProject = {};
  for (const f of failed) (byProject[projectOf(f)] ??= []).push(f);
  const lines = [];
  const stillFailing = [];
  let output = "";
  let passed = 0;
  for (const [project, group] of Object.entries(byProject)) {
    const cmd = `vitest run --project=${project} --no-file-parallelism --maxWorkers=1 ${group.map(shellQuote).join(" ")} --reporter=default --reporter=json --outputFile.json=${shellQuote(jsonFile)}`;
    const run = execShell(cmd);
    output += `\n--- isolated re-run (${project}) ---\n$ ${cmd}\n${run.stdout ?? ""}`;
    let report;
    try {
      report = JSON.parse(readFileSync(jsonFile, "utf8"));
    } catch {
      report = undefined;
    }
    if (run.status === 0 && report?.success) {
      passed += report.numPassedTests;
      continue;
    }
    if (report) {
      const bad = new Set(failedFiles(report));
      stillFailing.push(...group.filter((f) => bad.has(f)));
      lines.push(...vitestFailures(report).slice(1));
    } else {
      stillFailing.push(...group);
      lines.push(...fallbackLines(run.stdout ?? "", "vitest"));
    }
  }
  return { passed, stillFailing, lines, output };
}

function runStep(step, { files, fast, retry }) {
  const work = mkdtempSync(join(tmpdir(), "quiet-"));
  const jsonFile = join(work, "vitest.json");
  const eslintFile = join(work, "eslint.json");
  let cmd = step.cmd;
  if (step.name === "tsc") cmd += " --pretty false";
  if (step.name === "eslint") cmd += ` --format json --output-file ${shellQuote(eslintFile)}`;
  if (step.name === "vitest") {
    if (files.length > 0) cmd = `vitest related ${files.map(shellQuote).join(" ")} --run --passWithNoTests --project=node`;
    else if (fast) cmd += " --project=node";
    cmd += ` --reporter=default --reporter=json --outputFile.json=${shellQuote(jsonFile)}`;
  }
  const started = Date.now();
  const run = execShell(cmd);
  const elapsed = Date.now() - started;
  let report;
  if (step.name === "vitest") {
    try {
      report = JSON.parse(readFileSync(jsonFile, "utf8"));
    } catch {
      report = undefined;
    }
  }
  let eslintReport;
  if (step.name === "eslint") {
    try {
      eslintReport = JSON.parse(readFileSync(eslintFile, "utf8"));
    } catch {
      eslintReport = undefined;
    }
  }
  let output = run.stdout ?? "";
  let ok = run.status === 0 && run.error === undefined;
  let retried;
  if (step.name === "vitest" && !ok && retry && report) {
    const failed = failedFiles(report);
    if (failed.length > 0) {
      retried = retryFailed(failed, jsonFile);
      output += retried.output;
      if (retried.stillFailing.length === 0) {
        ok = true;
        report = { ...report, numPassedTests: report.numPassedTests + report.numFailedTests, numFailedTests: 0 };
        retried.files = failed;
      }
    }
  }
  rmSync(work, { recursive: true, force: true });
  const related = step.name === "vitest" && files.length > 0;
  let label = `${step.name} ${seconds(elapsed)}`;
  if (report && ok) {
    const marker = !related ? "" : report.numTotalTests === 0 ? " (related: no tests matched)" : " (related)";
    label = `${step.name} ${vitestSummary(report)} ${seconds(elapsed)}${marker}`;
    if (retried?.files) label = retriedLabel(report.numPassedTests, retried.files, seconds(Date.now() - started)) + marker;
  }
  let useful;
  if (step.name === "tsc") useful = tscErrors(output);
  else if (eslintReport) useful = eslintFailures(eslintReport);
  else if (retried && !ok) useful = [`${retried.stillFailing.length} file(s) still failing after isolated re-run (first run: ${report.numFailedTests} failed)`, ...retried.lines];
  else if (report && !report.success) useful = vitestFailures(report);
  if (!useful || useful.length === 0) useful = fallbackLines(output, step.name);
  return { ok, label, cmd, output, useful };
}

function writeLog(step, result) {
  const dir = join(ROOT, ".orchestration/logs");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const path = join(dir, `v-${stamp}-${step.name}.log`);
  writeFileSync(path, `$ ${result.cmd}\n\n${result.output}`);
  return path;
}

function main(args) {
  if (wantsHelp(args)) return console.log(HELP);
  const steps = stepsFromPackage(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")));
  const only = flagValue(args, "--step");
  const selected = only ? steps.filter((s) => s.name === only) : steps;
  if (selected.length === 0) {
    console.log(`unknown step ${only}; steps: ${steps.map((s) => s.name).join(", ")}`);
    process.exit(2);
  }
  const fast = args.includes("--fast");
  const retry = !args.includes("--no-retry");
  const files = (flagValue(args, "--files") ?? "").split(",").filter(Boolean);
  const missing = files.filter((f) => !existsSync(resolve(f)));
  if (missing.length > 0) {
    console.log(missing.map((f) => `not found: ${f}`).join("\n"));
    process.exit(2);
  }
  const labels = [];
  for (const step of selected) {
    const result = runStep(step, { files, fast, retry });
    if (result.ok) {
      labels.push(result.label);
      continue;
    }
    const log = writeLog(step, result);
    console.log([`FAIL ${step.name}`, ...clipLines(result.useful, MAX_LINES - 2), `log: ${log}`].join("\n"));
    process.exit(1);
  }
  console.log(`OK ${labels.join(" · ")}`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
