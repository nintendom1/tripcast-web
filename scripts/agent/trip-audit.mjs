import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { ROOT, flagValue, isMain, lineOf, walk, wantsHelp } from "./lib.mjs";

const HELP = `trip-audit: counts raw Convex calls on refs that take a tripId, per web source file (static scan, heuristic).
  node scripts/agent/trip-audit.mjs [--files a.tsx,b.ts] [--folders] [--json] [--assume-all]
rawTripCall = useQuery/useMutation/usePaginatedQuery/useAction from convex/react, or .query(/.mutation(/.action( with a
tripcastApi ref whose args include tripId. Such calls belong in useTripQuery/useTripMutation/useTripConvex (src/convex/useTrip.ts).
unresolved = a convex call whose ref cannot be resolved statically (prop, argument, dynamic); never ignored, counted separately.
--assume-all treats every ref in tripcastApi.ts as taking tripId, to compare the total with an independent count of call sites.
--folders adds an informational "hooks=<n>" line per feature folder (all convex/react hook calls).
Scans src/**/*.{ts,tsx} except tests, stories, src/test/, src/convex/tripcastApi.ts and src/convex/useTrip.ts.
Prints files with a non-zero count, then "TOTAL rawTripCall=<n> unresolved=<n>"; exit 2 if a --files entry was not scanned.`;

const EXEMPT = new Set(["src/convex/tripcastApi.ts", "src/convex/useTrip.ts"]);
const HOOKS = new Set(["useQuery", "useMutation", "usePaginatedQuery", "useAction"]);
const CLIENT_CALLS = new Set(["query", "mutation", "action"]);

const typeProps = (checker, node) => new Set(checker.getPropertiesOfType(checker.getTypeFromTypeNode(node)).map((p) => p.name));

/**
 * Refs in the API template that take `tripId`: the set of `group.fn` paths under `export const tripcastApi = { ... }`
 * whose `FunctionReference<_, _, ARGS, _>` ARGS has a `tripId` property (aliases and intersections are resolved).
 */
export function tripRefs(apiText) {
  return apiRefs(apiText).trip;
}

/** `{ all, trip }`: every `group.fn` path in the template, and those whose args take `tripId`. */
export function apiRefs(apiText) {
  const name = "/virtual/tripcastApi.ts";
  const program = programFor({ [name]: apiText });
  const sf = program.getSourceFile(name);
  const checker = program.getTypeChecker();
  const found = new Set();
  const all = new Set();
  const visit = (obj, prefix) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) continue;
      const path = prefix ? `${prefix}.${prop.name.text}` : prop.name.text;
      let init = prop.initializer;
      if (ts.isObjectLiteralExpression(init)) visit(init, path);
      else if (ts.isAsExpression(init) && ts.isTypeReferenceNode(init.type) && init.type.typeName.getText() === "FunctionReference" && init.type.typeArguments?.[2]) {
        all.add(path);
        if (typeProps(checker, init.type.typeArguments[2]).has("tripId")) found.add(path);
      }
    }
  };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const decl of st.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === "tripcastApi" && decl.initializer) {
        let expr = decl.initializer;
        while (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr) || ts.isParenthesizedExpression(expr)) expr = expr.expression;
        if (ts.isObjectLiteralExpression(expr)) visit(expr, "");
      }
    }
  }
  return { all, trip: found };
}

function programFor(sources) {
  const options = { noLib: true, types: [], noResolve: true, skipLibCheck: true };
  const host = ts.createCompilerHost(options, true);
  const { getSourceFile } = host;
  host.getSourceFile = (n, ...rest) => (n in sources ? ts.createSourceFile(n, sources[n], ts.ScriptTarget.Latest, true, n.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) : getSourceFile(n, ...rest));
  host.fileExists = (n) => n in sources;
  host.readFile = (n) => sources[n];
  return ts.createProgram({ rootNames: Object.keys(sources), options, host });
}

const unwrap = (e) => {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
};

/**
 * `group.fn` paths a ref expression can evaluate to: `tripcastApi.a.b` (or a local alias of tripcastApi), a same-file
 * const of such an expression, either branch of a conditional, a property of a same-file object-literal const.
 * `undefined` when any part is not statically known (prop, argument, call result, import from elsewhere).
 */
function refPaths(expr, ctx, depth = 0) {
  if (depth > 6) return undefined;
  const e = unwrap(expr);
  if (ts.isConditionalExpression(e)) {
    const a = refPaths(e.whenTrue, ctx, depth + 1);
    const b = refPaths(e.whenFalse, ctx, depth + 1);
    return a && b ? [...a, ...b] : undefined;
  }
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) {
    const a = refPaths(e.left, ctx, depth + 1);
    const b = refPaths(e.right, ctx, depth + 1);
    return a && b ? [...a, ...b] : undefined;
  }
  const parts = [];
  let cur = e;
  while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
    const name = ts.isPropertyAccessExpression(cur) ? cur.name.text : ts.isStringLiteralLike(cur.argumentExpression) ? cur.argumentExpression.text : undefined;
    if (name === undefined) return undefined;
    parts.unshift(name);
    cur = unwrap(cur.expression);
  }
  if (!ts.isIdentifier(cur)) return undefined;
  if (parts.length > 0 && ctx.apiNames.has(cur.text)) return [parts.join(".")];
  const init = ctx.consts.get(cur.text);
  if (!init) return undefined;
  if (parts.length === 0) return refPaths(init, ctx, depth + 1);
  const obj = unwrap(init);
  if (!ts.isObjectLiteralExpression(obj) || parts.length !== 1) return undefined;
  const prop = obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === parts[0]);
  return prop ? refPaths(prop.initializer, ctx, depth + 1) : undefined;
}

/** Local names bound to `tripcastApi` and to the `convex/react` namespace in one file. */
function fileBindings(sf) {
  const apiNames = new Set(["tripcastApi"]);
  const reactNs = new Set();
  const hookNames = new Map();
  const consts = new Map();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings) {
      const from = st.moduleSpecifier.text;
      const nb = st.importClause.namedBindings;
      if (from === "convex/react") {
        if (ts.isNamespaceImport(nb)) reactNs.add(nb.name.text);
        else for (const el of nb.elements) if (HOOKS.has((el.propertyName ?? el.name).text)) hookNames.set(el.name.text, (el.propertyName ?? el.name).text);
      } else if (ts.isNamedImports(nb)) {
        for (const el of nb.elements) if ((el.propertyName ?? el.name).text === "tripcastApi") apiNames.add(el.name.text);
      }
    }
  }
  walk(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && node.parent.flags & ts.NodeFlags.Const && !consts.has(node.name.text)) consts.set(node.name.text, node.initializer);
  });
  return { apiNames, reactNs, hookNames, consts };
}

/**
 * Per-file `{ rawTripCall: line[], unresolved: line[], hooks }`. `hooks` counts every convex/react hook call, trip-scoped or not.
 * `unresolved` lists convex calls whose ref is not statically known. `refs` is a Set of tripId paths.
 */
export function auditText(text, refs, fileName = "/virtual/src/fixture.tsx") {
  const sf = programFor({ [fileName]: text }).getSourceFile(fileName);
  const ctx = fileBindings(sf);
  const rawTripCall = [];
  const unresolved = [];
  let hooks = 0;
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    let hook;
    if (ts.isIdentifier(callee)) hook = ctx.hookNames.get(callee.text);
    else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ctx.reactNs.has(callee.expression.text) && HOOKS.has(callee.name.text)) hook = callee.name.text;
    const client = ts.isPropertyAccessExpression(callee) && CLIENT_CALLS.has(callee.name.text) && !(ts.isIdentifier(callee.expression) && ctx.reactNs.has(callee.expression.text));
    if (hook) hooks++;
    if (!hook && !client) return;
    const first = node.arguments[0];
    const paths = first && refPaths(first, ctx);
    if (!paths) unresolved.push(lineOf(sf, node));
    else if (paths.some((p) => refs.has(p))) rawTripCall.push(lineOf(sf, node));
  });
  return { rawTripCall, unresolved, hooks };
}

const EXCLUDED_FILE = /\.(test|spec|stories)\.tsx?$/;

/** Repo-relative `src/**` .ts/.tsx files to scan. */
export function listSourceFiles(root = ROOT) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && rel !== "src/test") visit(rel);
      } else if (/\.tsx?$/.test(entry.name) && !EXCLUDED_FILE.test(entry.name) && !entry.name.endsWith(".d.ts") && !EXEMPT.has(rel)) out.push(rel);
    }
  };
  visit("src");
  return out.sort();
}

/** `src/features/<x>` for feature files, else the first directory under src (`src` for root files). */
export const folderOf = (file) => {
  const parts = file.split("/");
  return parts.slice(0, Math.min(file.startsWith("src/features/") ? 3 : 2, parts.length - 1)).join("/");
};

/** Splits `--files` into scanned paths and paths that were not scanned. */
export function resolveTargets(filesArg, scanned, root = ROOT, cwd = process.cwd()) {
  const wanted = filesArg.split(",").filter(Boolean).map((f) => relative(root, resolve(cwd, f)).split("\\").join("/"));
  const scannedSet = new Set(scanned);
  return { targets: wanted.filter((f) => scannedSet.has(f)), missing: wanted.filter((f) => !scannedSet.has(f)) };
}

export function auditRepo({ targets, root = ROOT, assumeAll = false } = {}) {
  const scanned = listSourceFiles(root);
  const api = apiRefs(readFileSync(join(root, "src/convex/tripcastApi.ts"), "utf8"));
  const refs = assumeAll ? api.all : api.trip;
  const files = {};
  const unresolved = {};
  const folders = {};
  for (const file of targets ?? scanned) {
    const { rawTripCall, unresolved: lost, hooks } = auditText(readFileSync(join(root, file), "utf8"), refs, join(root, file));
    if (rawTripCall.length > 0) files[file] = { rawTripCall: rawTripCall.length, lines: rawTripCall };
    if (lost.length > 0) unresolved[file] = lost;
    if (hooks > 0) folders[folderOf(file)] = (folders[folderOf(file)] ?? 0) + hooks;
  }
  const total = { rawTripCall: Object.values(files).reduce((n, v) => n + v.rawTripCall, 0), unresolved: Object.values(unresolved).reduce((n, v) => n + v.length, 0) };
  return { files, unresolved, folders, total, scanned: (targets ?? scanned).length, tripRefs: refs.size };
}

function main(args) {
  if (wantsHelp(args)) return console.log(HELP);
  const filesArg = flagValue(args, "--files");
  let targets;
  if (filesArg !== undefined) {
    const resolved = resolveTargets(filesArg, listSourceFiles());
    if (resolved.missing.length > 0 || resolved.targets.length === 0) {
      for (const path of resolved.missing) console.log(`not audited: ${path} (not a scanned src file)`);
      if (resolved.missing.length === 0) console.log("not audited: --files is empty");
      process.exit(2);
    }
    targets = resolved.targets;
  }
  const result = auditRepo({ targets, assumeAll: args.includes("--assume-all") });
  if (args.includes("--json")) return console.log(JSON.stringify(result, null, 2));
  for (const [file, { rawTripCall }] of Object.entries(result.files)) console.log(`${file}: rawTripCall=${rawTripCall}`);
  for (const [file, lines] of Object.entries(result.unresolved)) console.log(`${file}: unresolved=${lines.length} (lines ${lines.join(",")})`);
  if (args.includes("--folders")) for (const [folder, hooks] of Object.entries(result.folders).sort()) console.log(`${folder}: hooks=${hooks}`);
  console.log(`TOTAL rawTripCall=${result.total.rawTripCall} unresolved=${result.total.unresolved}`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
