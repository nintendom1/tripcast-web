import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { flagValue, isMain, wantsHelp } from "./lib.mjs";

const HELP = `scope: checks changed paths against the brief's OWNED: line (first backtick span per comma item; !glob excludes).
  node scripts/agent/scope.mjs <brief.md> [--base <ref>]
Changed = git status --porcelain, plus git diff --name-only --no-renames <ref>...HEAD with --base.
Prints "OK n/n owned" or the out-of-scope paths (40 lines max); exit 1 when any, 2 on usage errors.`;

/**
 * Globs from the first `OWNED:` line. With backticks, each comma-separated item contributes its first
 * backtick span (later spans are prose); without, each item is a glob. A leading `!` excludes.
 */
export function parseOwned(briefText) {
  const line = briefText.split("\n").find((l) => /^[\s>*-]*\**OWNED\**\s*:/.test(l));
  if (!line) throw new Error("brief has no OWNED: line");
  const rest = line.replace(/^[^:]*:\**/, "");
  const items = rest.split(/,(?=(?:[^`]*`[^`]*`)*[^`]*$)/).map((s) => s.trim()).filter(Boolean);
  if (!rest.includes("`")) return items.map((s) => s.replace(/\.$/, ""));
  return items.flatMap((item) => {
    const span = item.match(/`([^`]+)`/);
    return span ? [span[1].trim()] : [];
  });
}

/** `dir/` owns everything under it, `a/**` and `*` follow glob rules, anything else is an exact path. */
export function globToRegExp(glob) {
  if (glob.endsWith("/")) return new RegExp(`^${escapeGlob(glob.slice(0, -1))}/`);
  const source = glob
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      if (part === "?") return "[^/]";
      return escapeGlob(part);
    })
    .join("");
  return new RegExp(`^${source}$`);
}

const escapeGlob = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

export function checkScope(globs, paths) {
  const included = globs.filter((g) => !g.startsWith("!")).map(globToRegExp);
  const excluded = globs.filter((g) => g.startsWith("!")).map((g) => globToRegExp(g.slice(1)));
  const outOfScope = paths.filter((p) => !included.some((re) => re.test(p)) || excluded.some((re) => re.test(p)));
  return { ok: outOfScope.length === 0, total: paths.length, outOfScope };
}

/** Paths from `git status --porcelain -z` output; renames contribute both sides. */
export function parsePorcelainZ(output) {
  const parts = output.split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2);
    paths.push(parts[i].slice(3));
    if (status.includes("R") || status.includes("C")) paths.push(parts[++i]);
  }
  return paths;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Worktree changes plus, with `base`, committed changes; `--no-renames` keeps a rename's source path visible. */
export function changedPaths(base, cwd = process.cwd()) {
  const paths = new Set(parsePorcelainZ(git(["status", "--porcelain", "-z", "--untracked-files=all"], cwd)));
  if (base) for (const p of git(["diff", "--name-only", "--no-renames", `${base}...HEAD`], cwd).split("\n")) if (p) paths.add(p);
  return [...paths].sort();
}

const MAX_OUTPUT_LINES = 40;

export function formatOutOfScope(outOfScope, total) {
  const shown = outOfScope.length > MAX_OUTPUT_LINES - 1 ? outOfScope.slice(0, MAX_OUTPUT_LINES - 2) : outOfScope;
  const more = shown.length < outOfScope.length ? [`… ${outOfScope.length - shown.length} more`] : [];
  return [`OUT OF SCOPE ${outOfScope.length}/${total}:`, ...shown, ...more].join("\n");
}

function main(args) {
  if (wantsHelp(args)) return console.log(HELP);
  const base = flagValue(args, "--base");
  const brief = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
  if (!brief || (args.includes("--base") && !base)) {
    console.log(`usage: ${HELP.split("\n")[1].trim()}`);
    process.exit(2);
  }
  let result;
  try {
    result = checkScope(parseOwned(readFileSync(brief, "utf8")), changedPaths(base));
  } catch (error) {
    console.log(`scope: ${String(error.stderr || error.message).trim().split("\n")[0]}`);
    process.exit(2);
  }
  if (result.ok) return console.log(`OK ${result.total}/${result.total} owned`);
  console.log(formatOutOfScope(result.outOfScope, result.total));
  process.exit(1);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
