// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clipLines, eslintFailures, failedFiles, fallbackLines, messageLines, projectOf, retriedLabel, stepsFromPackage, tscErrors, vitestFailures } from "./quiet.mjs";
import { changedPaths, checkScope, formatOutOfScope, globToRegExp, parseOwned, parsePorcelainZ } from "./scope.mjs";
import { apiRefs, auditText, folderOf, resolveTargets, tripRefs } from "./trip-audit.mjs";

const API = `
type Args = { token: string; tripId: string };
type Plain = { token: string };
export const tripcastApi = {
  checkpoints: {
    listCheckpoints: (anyApi as any).checkpoints.listCheckpoints as FunctionReference<"query", "public", Args, Checkpoint[]>,
    add: (anyApi as any).checkpoints.add as FunctionReference<"mutation", "public", Plain & { tripId?: string }, null>,
    mine: (anyApi as any).checkpoints.mine as FunctionReference<"query", "public", Plain, null>,
  },
  nested: { deep: { fn: (anyApi as any).nested.fn as FunctionReference<"action", "public", { tripId: string }, null> } },
};`;
const REFS = tripRefs(API);
const audit = (body) => auditText(body, REFS);
const IMPORTS = `import { useQuery, useMutation } from "convex/react";\nimport { tripcastApi } from "../convex/tripcastApi";\n`;

describe("trip-audit web counter", () => {
  it("reads which refs take tripId, through aliases, intersections and nesting", () => {
    expect([...REFS].sort()).toEqual(["checkpoints.add", "checkpoints.listCheckpoints", "nested.deep.fn"]);
  });

  it("counts a raw useQuery on a tripId ref once, and the same call through useTripQuery not at all (mutation check)", () => {
    expect(audit(`${IMPORTS}function A() { return useQuery(tripcastApi.checkpoints.listCheckpoints, { token: "t", tripId: "x" }); }`).rawTripCall).toHaveLength(1);
    const wrapped = `import { useTripQuery } from "../convex/useTrip";\n${IMPORTS}function A() { return useTripQuery(tripcastApi.checkpoints.listCheckpoints, { token: "t" }); }`;
    expect(audit(wrapped).rawTripCall).toHaveLength(0);
  });

  it("ignores refs without tripId and non-convex hooks of the same name", () => {
    expect(audit(`${IMPORTS}function A() { return useQuery(tripcastApi.checkpoints.mine, { token: "t" }); }`).rawTripCall).toHaveLength(0);
    expect(audit(`import { useQuery } from "other";\nimport { tripcastApi } from "x";\nfunction A() { return useQuery(tripcastApi.checkpoints.listCheckpoints); }`).rawTripCall).toHaveLength(0);
  });

  it("counts namespace hooks, imperative client calls, aliased api names and ref constants", () => {
    const body = `import * as convexReact from "convex/react";
import { useQuery } from "convex/react";
import { tripcastApi as api } from "../convex/tripcastApi";
const ref = api.checkpoints.add;
function A(client) {
  convexReact.useMutation(api.checkpoints.add);
  convexReact.usePaginatedQuery(api.checkpoints.listCheckpoints, {}, {});
  useQuery(ref);
  client.query(api.nested.deep.fn, {});
  client.mutation(api.checkpoints.mine, {});
}`;
    expect(audit(body).rawTripCall).toEqual([6, 7, 8, 9]);
  });

  it("follows both branches of a conditional ref, so one trip-scoped branch is counted once", () => {
    expect(audit(`${IMPORTS}function A(t) { return useQuery(t ? tripcastApi.checkpoints.mine : tripcastApi.checkpoints.listCheckpoints, { token: "t" }); }`).rawTripCall).toHaveLength(1);
    expect(audit(`${IMPORTS}function A(t) { return useQuery(t ? tripcastApi.checkpoints.mine : tripcastApi.checkpoints.mine, "skip"); }`)).toMatchObject({ rawTripCall: [], unresolved: [] });
  });

  it("reports refs it cannot resolve (prop, argument, call result) as unresolved instead of ignoring them", () => {
    const body = `${IMPORTS}
function A(props, ref) {
  useQuery(props.ref, {});
  useMutation(ref);
  useQuery(pick(), {});
  client.query(getRef(), {});
  useQuery(tripcastApi.checkpoints.mine, {});
}`;
    expect(audit(body)).toMatchObject({ rawTripCall: [], unresolved: [5, 6, 7, 8] });
  });

  it("--assume-all treats every ref as trip-scoped (apiRefs.all)", () => {
    const { all, trip } = apiRefs(API);
    expect([...all].sort()).toEqual(["checkpoints.add", "checkpoints.listCheckpoints", "checkpoints.mine", "nested.deep.fn"]);
    expect(trip.has("checkpoints.mine")).toBe(false);
    expect(auditText(`${IMPORTS}function A() { useQuery(tripcastApi.checkpoints.mine, {}); }`, all).rawTripCall).toHaveLength(1);
  });

  it("counts every convex/react hook as informational hooks, scoped or not", () => {
    expect(audit(`${IMPORTS}function A() { useQuery(tripcastApi.checkpoints.mine); useMutation(tripcastApi.checkpoints.mine); }`).hooks).toBe(2);
  });

  it("ignores comments and strings", () => {
    expect(audit(`${IMPORTS}// useQuery(tripcastApi.checkpoints.listCheckpoints)\nconst s = "useQuery(tripcastApi.checkpoints.listCheckpoints)";`).rawTripCall).toHaveLength(0);
  });

  it("groups hooks by feature folder and separates --files not scanned", () => {
    expect(folderOf("src/features/map/a/b.tsx")).toBe("src/features/map");
    expect(folderOf("src/providers/x.tsx")).toBe("src/providers");
    expect(folderOf("src/App.tsx")).toBe("src");
    const r = resolveTargets("src/a.ts,/r/src/missing.ts,nope.ts", ["src/a.ts"], "/r", "/r");
    expect(r).toEqual({ targets: ["src/a.ts"], missing: ["src/missing.ts", "nope.ts"] });
  });
});

describe("scope checker", () => {
  const brief = "# Brief\n\nOWNED: `scripts/agent/**`, `package.json`, `.gitignore` (add `.orchestration/` only).\n";

  it("takes the first backtick span of each comma item, or comma items without backticks", () => {
    expect(parseOwned(brief)).toEqual(["scripts/agent/**", "package.json", ".gitignore"]);
    expect(parseOwned("OWNED: `scripts/agent/**` only; do not touch `convex/`")).toEqual(["scripts/agent/**"]);
    expect(parseOwned("OWNED: `a/{x,y}.ts`, the `b` block of `c.json`")).toEqual(["a/{x,y}.ts", "b"]);
    expect(parseOwned("OWNED: src/a.ts, src/b/**.")).toEqual(["src/a.ts", "src/b/**"]);
    expect(() => parseOwned("no owned line")).toThrow("OWNED");
  });

  it("passes owned paths and names the rest", () => {
    const globs = parseOwned(brief);
    expect(checkScope(globs, ["scripts/agent/a.mjs", "scripts/agent/sub/b.mjs", "package.json", ".gitignore"])).toEqual({ ok: true, total: 4, outOfScope: [] });
    const result = checkScope(globs, ["scripts/agent/a.mjs", "scripts/exportTripcastApi.ts", "convex/schema.ts"]);
    expect(result.ok).toBe(false);
    expect(result.outOfScope).toEqual(["scripts/exportTripcastApi.ts", "convex/schema.ts"]);
  });

  it("lets a !glob carve a path out of an owned glob", () => {
    const globs = parseOwned("OWNED: `scripts/**`, `!scripts/exportTripcastApi.ts`");
    expect(checkScope(globs, ["scripts/agent/a.mjs", "scripts/exportTripcastApi.ts"]).outOfScope).toEqual(["scripts/exportTripcastApi.ts"]);
  });

  it("matches globs strictly", () => {
    expect(globToRegExp("a/**").test("a/b/c.ts")).toBe(true);
    expect(globToRegExp("a/*.ts").test("a/b/c.ts")).toBe(false);
    expect(globToRegExp("a/**/c.ts").test("a/c.ts")).toBe(true);
    expect(globToRegExp("dir/").test("dir/x/y")).toBe(true);
    expect(globToRegExp("scripts").test("scripts/x.ts")).toBe(false);
  });

  it("lists untracked files and both sides of a rename from porcelain -z", () => {
    expect(parsePorcelainZ(" M a.ts\0?? dir/new.ts\0R  b.ts\0old.ts\0")).toEqual(["a.ts", "dir/new.ts", "b.ts", "old.ts"]);
  });

  it("keeps the source of a committed rename visible with --base", () => {
    const dir = mkdtempSync(join(tmpdir(), "scope-test-"));
    const git = (...args) => execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "pipe" });
    try {
      git("init", "-q", "-b", "main");
      mkdirSync(join(dir, "convex"));
      writeFileSync(join(dir, "convex/ticker.ts"), "export const ticker = 1;\n".repeat(20));
      git("add", ".");
      git("commit", "-q", "-m", "base");
      mkdirSync(join(dir, "scripts/agent"), { recursive: true });
      git("mv", "convex/ticker.ts", "scripts/agent/zz_ticker.ts");
      git("commit", "-q", "-m", "move");
      const changed = changedPaths("HEAD~1", dir);
      expect(changed).toEqual(["convex/ticker.ts", "scripts/agent/zz_ticker.ts"]);
      expect(checkScope(["scripts/agent/**"], changed).outOfScope).toEqual(["convex/ticker.ts"]);
      expect(() => changedPaths("nosuchref", dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("caps the out-of-scope list at 40 lines", () => {
    const paths = Array.from({ length: 70 }, (_, i) => `p${i}`);
    const lines = formatOutOfScope(paths, 90).split("\n");
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe("OUT OF SCOPE 70/90:");
    expect(lines.at(-1)).toBe("… 32 more");
    expect(formatOutOfScope(paths.slice(0, 39), 39).split("\n")).toHaveLength(40);
  });
});

describe("quiet helpers", () => {
  it("names the isolated re-run in the OK line and picks the project from the file", () => {
    expect(retriedLabel(1358, ["src/a.test.tsx", "src/b.stories.tsx"], "75s")).toBe("vitest 1358✓ 75s (2 files green only on isolated re-run: src/a.test.tsx, src/b.stories.tsx)");
    expect(retriedLabel(5, ["src/a.test.tsx"], "9.0s")).toContain("(1 file green only on isolated re-run: src/a.test.tsx)");
    expect(projectOf("src/x/Y.stories.tsx")).toBe("storybook");
    expect(projectOf("src/x/Y.test.tsx")).toBe("node");
    const report = { testResults: [{ name: "/r/src/a.test.ts", status: "failed", assertionResults: [{ status: "failed" }] }, { name: "/r/src/ok.test.ts", status: "passed", assertionResults: [{ status: "passed" }] }, { name: "/r/src/s.test.ts", status: "failed", assertionResults: [] }] };
    expect(failedFiles(report, "/r")).toEqual(["src/a.test.ts", "src/s.test.ts"]);
  });

  it("derives the four web steps from validate and keeps only error lines from tsc output", () => {
    const steps = stepsFromPackage({ scripts: { validate: "npm run lint:terms:report && tsc -b && eslint . && vitest run", "lint:terms:report": "node scripts/lintTerms.mjs --mode=report" } });
    expect(steps.map((s) => s.name)).toEqual(["terms", "tsc", "eslint", "vitest"]);
    expect(tscErrors("noise\na.ts(1,1): error TS2322: bad\n  detail\nmore noise\n")).toEqual(["a.ts(1,1): error TS2322: bad", "  detail"]);
  });

  it("prints eslint errors as file:line rule message and drops warnings", () => {
    const results = [{ filePath: "/r/src/a.ts", messages: [{ severity: 2, line: 4, ruleId: "no-undef", message: "x is not defined\nmore" }, { severity: 1, line: 5, ruleId: "w", message: "warn" }] }];
    expect(eslintFailures(results, "/r")).toEqual(["src/a.ts:4 no-undef x is not defined"]);
  });
  it("lists failing tests with their assertion message and no stack", () => {
    const report = {
      numFailedTests: 1,
      numPassedTests: 2,
      testResults: [{ name: "/r/a.test.ts", status: "failed", assertionResults: [{ status: "failed", fullName: "a > b", failureMessages: ["AssertionError: nope\n    at x (y.ts:1:1)"] }] }],
    };
    expect(vitestFailures(report, "/r")).toEqual(["1 failed, 2 passed", "✗ a.test.ts > a > b", "    AssertionError: nope"]);
  });

  it("keeps the first stack frame inside the repo, skipping node_modules", () => {
    const message = "AssertionError: x\n    at file:///r/node_modules/@vitest/runner/c.js:3:4\n    at /r/convex/ticker.test.ts:77:5\n    at /r/convex/other.test.ts:1:1";
    expect(messageLines(message, "/r")).toEqual(["    AssertionError: x", "    at convex/ticker.test.ts:77"]);
  });

  it("starts the vitest fallback at the first error and drops passing-test lines", () => {
    const output = ["✓ a.test.ts (3 tests) 4ms", " ✓ b.test.ts (1 test)", "⎯⎯ Unhandled Errors ⎯⎯", "Error: boom", "> npm banner"].join("\n");
    expect(fallbackLines(output, "vitest")).toEqual(["⎯⎯ Unhandled Errors ⎯⎯", "Error: boom"]);
    expect(fallbackLines("a\nb", "terms")).toEqual(["a", "b"]);
  });

  it("counts what truncation cut", () => {
    const lines = Array.from({ length: 70 }, (_, i) => `e${i}`);
    const clipped = clipLines(lines, 58);
    expect(clipped).toHaveLength(58);
    expect(clipped.at(-1)).toBe("… 13 more (see log)");
    expect(clipLines(lines.slice(0, 58), 58)).toHaveLength(58);
  });
});
