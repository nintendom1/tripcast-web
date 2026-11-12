import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { ROOT, flagValue, isMain, lineOf, walk, wantsHelp } from "./lib.mjs";

const HELP = `trip-audit: counts raw Convex calls on refs that take a tripId, per web source file (static scan, heuristic).
  node scripts/agent/trip-audit.mjs [--files a.tsx,b.ts] [--folders] [--json] [--assume-all] [--allowed]
rawTripCall = useQuery/useMutation/usePaginatedQuery/useAction from convex/react, or .query(/.mutation(/.action( with a
tripcastApi ref whose args include tripId. Such calls belong in useTripQuery/useTripPaginatedQuery/useTripMutation/useTripConvex,
or tripClientFor(client, tripId) for a call that names its own trip (src/convex/useTrip.ts; those hooks are never counted).
A cast to TripConvexClient (\`x as TripConvexClient\`, also through \`as unknown\`) of a client that is not trip-aware also
counts as a rawTripCall: it would make a plain client look trip-aware. So does \`x as any\` / \`x as never\` flowing into a
slot typed TripConvexClient: a typed variable, a return of a function declared to return it, or a call argument (or a
property of an object-literal argument) whose same-file parameter type says so.
unresolved = a convex call whose ref cannot be resolved statically (prop, argument, dynamic); never ignored, counted separately.
--assume-all treats every ref in tripcastApi.ts as taking tripId, to compare the total with an independent count of call sites.
--folders adds an informational "hooks=<n>" line per feature folder (all convex/react hook calls).
A .query(/.mutation(/.action( call is trip-aware, not raw, when its receiver is (a) the result of useTripConvex() or
tripClientFor() (the import from the useTrip module itself; a local function of that name is not trusted), (b) an identifier, parameter or destructured parameter typed
TripConvexClient, CapturedTripConvexClient or ReturnType<typeof useTripConvex>, (c) the result of a function declared in the
same file with return type TripConvexClient, or (d) \`a ?? b\`, \`a || b\` or \`c ? a : b\` of trip-aware receivers; resolved per
scope, so a plain client (useConvex(), ConvexReactClient) still counts.
Marker: a line comment \`// trip-audit-ok: <reason>\` (1 to 12 words), alone on its line, directly above a line allows ONE
rawTripCall on that line (untagged by design). Only real comments count: the same text inside a string, template or JSX
text is not a marker. A marker with no hit on the next line, or with no reason or more than 12 words, allows nothing and counts
as staleMarker; any staleMarker exits 1. --allowed lists every allowed call with its reason.
Scans src/**/*.{ts,tsx} except tests, stories, src/test/, src/convex/tripcastApi.ts and src/convex/useTrip.ts.
Prints files with a non-zero count, then "TOTAL rawTripCall=<n> unresolved=<n> staleMarker=<n>"; exit 2 if a --files entry was
not scanned.`;

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

/** Type names of the trip-aware imperative client (`useTripConvex()` returns the captured variant). */
const TAGGED_TYPES = new Set(["TripConvexClient", "CapturedTripConvexClient"]);

/**
 * True for `TripConvexClient` / `CapturedTripConvexClient`, or `ReturnType<typeof f>` of a trusted helper imported from the
 * useTrip module (`useTripConvex`, `tripClientFor`), with `| undefined` / `| null` allowed (an optional parameter).
 */
function isTaggedType(type, ctx) {
  if (!type) return false;
  if (ts.isParenthesizedTypeNode(type)) return isTaggedType(type.type, ctx);
  if (ts.isUnionTypeNode(type)) {
    const members = type.types.filter((t) => !(t.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword)));
    return members.length > 0 && members.every((t) => isTaggedType(t, ctx));
  }
  if (!ts.isTypeReferenceNode(type)) return false;
  const name = ts.isQualifiedName(type.typeName) ? type.typeName.right.text : type.typeName.text;
  if (name === "ReturnType" && type.typeArguments?.length === 1) {
    const arg = type.typeArguments[0];
    return ts.isTypeQueryNode(arg) && ts.isIdentifier(arg.exprName) && isTrustedHelper(arg.exprName, ctx);
  }
  return TAGGED_TYPES.has(name);
}

/**
 * True when `identifier` is `useTripConvex` / `tripClientFor` imported from the useTrip module: it must resolve to that
 * import specifier, so a local declaration with the same name (shadowing or not) is never trusted.
 */
function isTrustedHelper(identifier, ctx) {
  if (!ctx.tripConvexNames.has(identifier.text)) return false;
  const decl = declOf(identifier, ctx.checker);
  return Boolean(decl && ts.isImportSpecifier(decl));
}

const isLooseType = (type) => type.kind === ts.SyntaxKind.AnyKeyword || type.kind === ts.SyntaxKind.NeverKeyword;

/** Declared type of member `name` of a type literal, or of a same-file type alias or interface. */
function memberTypeOf(type, name, checker) {
  if (!type || name === undefined) return undefined;
  let members;
  if (ts.isTypeLiteralNode(type)) members = type.members;
  else if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const decl = declOf(type.typeName, checker);
    if (decl && ts.isTypeAliasDeclaration(decl) && ts.isTypeLiteralNode(decl.type)) members = decl.type.members;
    else if (decl && ts.isInterfaceDeclaration(decl)) members = decl.members;
  }
  const member = members?.find((m) => ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) && m.name.text === name);
  return member?.type;
}

/** The function a callee identifier names in this file (a declaration, or a const holding an arrow/function expression). */
function calledFunction(callee, checker) {
  const decl = declOf(callee, checker);
  if (!decl) return undefined;
  if (ts.isFunctionDeclaration(decl)) return decl;
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const init = unwrap(decl.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  }
  return undefined;
}

/**
 * Declared type of the slot an expression flows into: a typed variable or class field, the return type of the enclosing
 * function, a same-file function's parameter (direct argument), or a member of the slot of an enclosing object literal.
 */
function slotTypeOf(expr, checker, depth = 0) {
  if (depth > 4) return undefined;
  let node = expr;
  let parent = node.parent;
  while (parent && (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent) || ts.isSatisfiesExpression(parent))) {
    node = parent;
    parent = parent.parent;
  }
  if (!parent) return undefined;
  if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.initializer === node) return parent.type;
  if (ts.isReturnStatement(parent)) return ts.findAncestor(parent, ts.isFunctionLike)?.type;
  if (ts.isArrowFunction(parent) && parent.body === node) return parent.type;
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === node && ts.isIdentifier(parent.left)) {
    const decl = declOf(parent.left, checker);
    return decl && (ts.isVariableDeclaration(decl) || ts.isParameter(decl)) ? decl.type : undefined;
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isObjectLiteralExpression(parent.parent)) {
    const name = ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) ? parent.name.text : undefined;
    return memberTypeOf(slotTypeOf(parent.parent, checker, depth + 1), name, checker);
  }
  if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(node)) {
    const callee = unwrap(parent.expression);
    const fn = ts.isIdentifier(callee) ? calledFunction(callee, checker) : undefined;
    return fn?.parameters[parent.arguments.indexOf(node)]?.type;
  }
  return undefined;
}

/** Declared type of a destructured parameter (`{ trip }: { trip: T }`), read from the parameter's inline type literal. */
function bindingTypeOf(element) {
  const pattern = element.parent;
  if (!ts.isObjectBindingPattern(pattern) || !ts.isParameter(pattern.parent)) return undefined;
  const literal = pattern.parent.type;
  if (!literal || !ts.isTypeLiteralNode(literal)) return undefined;
  const key = element.propertyName ?? element.name;
  if (!ts.isIdentifier(key)) return undefined;
  const member = literal.members.find((m) => ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) && m.name.text === key.text);
  return member?.type;
}

/** Declared return type node of a same-file function declaration, or of an arrow/function expression held in a const. */
function returnTypeOf(decl) {
  if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl) || ts.isMethodDeclaration(decl)) return decl.type;
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const init = unwrap(decl.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init.type;
  }
  return undefined;
}

const declOf = (identifier, checker) => {
  const symbol = checker.getSymbolAtLocation(identifier);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
};

/**
 * Whether the receiver of a `.query(`/`.mutation(`/`.action(` call is a trip-aware client: (a) the result of
 * `useTripConvex()`, (b) an identifier or parameter typed `TripConvexClient`, (c) the result of a same-file function
 * whose declared return type is `TripConvexClient`. Identifiers resolve through the checker, so shadowing is honoured and
 * a plain `useConvex()` client is never hidden.
 */
function taggedReceiver(expr, ctx, checker, depth = 0) {
  if (depth > 6) return false;
  const e = unwrap(expr);
  if (ts.isConditionalExpression(e)) return taggedReceiver(e.whenTrue, ctx, checker, depth + 1) && taggedReceiver(e.whenFalse, ctx, checker, depth + 1);
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) {
    return taggedReceiver(e.left, ctx, checker, depth + 1) && taggedReceiver(e.right, ctx, checker, depth + 1);
  }
  if (ts.isCallExpression(e)) {
    const callee = unwrap(e.expression);
    if (ts.isIdentifier(callee)) {
      if (isTrustedHelper(callee, ctx)) return true;
      const decl = declOf(callee, checker);
      return Boolean(decl && isTaggedType(returnTypeOf(decl), ctx));
    }
    return false;
  }
  if (ts.isIdentifier(e)) {
    const decl = declOf(e, checker);
    if (!decl) return false;
    if (ts.isParameter(decl)) return isTaggedType(decl.type, ctx);
    if (ts.isBindingElement(decl)) return isTaggedType(bindingTypeOf(decl), ctx);
    if (ts.isVariableDeclaration(decl)) return isTaggedType(decl.type, ctx) || Boolean(decl.initializer && taggedReceiver(decl.initializer, ctx, checker, depth + 1));
  }
  return false;
}

/** Local names bound to `tripcastApi` and to the `convex/react` namespace in one file. */
function fileBindings(sf) {
  const apiNames = new Set(["tripcastApi"]);
  const tripConvexNames = new Set();
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
        for (const el of nb.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (imported === "tripcastApi") apiNames.add(el.name.text);
          if ((imported === "useTripConvex" || imported === "tripClientFor") && /(^|\/)useTrip$/.test(from)) tripConvexNames.add(el.name.text);
        }
      }
    }
  }
  walk(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && node.parent.flags & ts.NodeFlags.Const && !consts.has(node.name.text)) consts.set(node.name.text, node.initializer);
  });
  return { apiNames, reactNs, hookNames, consts, tripConvexNames };
}

const MARKER = /^\/\/\s*trip-audit-ok:(.*)$/;
const MAX_REASON_WORDS = 12;

/** Every `//` comment of a parsed file, found as trivia between tokens: text inside strings, templates or JSX is not one. */
function lineComments(sf) {
  const seen = new Set();
  const out = [];
  const add = (ranges) => {
    for (const range of ranges ?? []) {
      if (range.kind !== ts.SyntaxKind.SingleLineCommentTrivia || seen.has(range.pos)) continue;
      seen.add(range.pos);
      out.push(range);
    }
  };
  // JSX text is content, never trivia: scanning from where it starts (it, or the syntax list holding it) would read the
  // text as comments.
  const jsxTextStarts = new Set();
  walk(sf, (node) => {
    if (node.kind === ts.SyntaxKind.JsxText || node.kind === ts.SyntaxKind.JsxTextAllWhiteSpaces) jsxTextStarts.add(node.pos);
  });
  const visit = (node) => {
    if (!jsxTextStarts.has(node.pos)) add(ts.getLeadingCommentRanges(sf.text, node.pos));
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return out;
}

/**
 * `// trip-audit-ok: <reason>` comments alone on their line: `{ line, reason }`, `reason` null when missing or over 12
 * words. `source` is file text (parsed here) or a parsed SourceFile.
 */
export function markersOf(source) {
  const sf = typeof source === "string" ? ts.createSourceFile("/virtual/markers.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) : source;
  const out = [];
  for (const range of lineComments(sf)) {
    const { line, character } = sf.getLineAndCharacterOfPosition(range.pos);
    if (sf.text.slice(range.pos - character, range.pos).trim() !== "") continue;
    const match = MARKER.exec(sf.text.slice(range.pos, range.end));
    if (!match) continue;
    const reason = match[1].trim();
    const words = reason ? reason.split(/\s+/).length : 0;
    out.push({ line: line + 1, reason: words > 0 && words <= MAX_REASON_WORDS ? reason : null });
  }
  return out.sort((a, b) => a.line - b.line);
}

/**
 * Per-file `{ rawTripCall: line[], unresolved: line[], hooks, allowed: {line, reason}[], staleMarker: line[] }`. `hooks` counts
 * every convex/react hook call, trip-scoped or not. `unresolved` lists convex calls whose ref is not statically known. A valid
 * marker moves one rawTripCall on the next line to `allowed`; a marker that allows nothing is a `staleMarker` (its line).
 * `refs` is a Set of tripId paths.
 */
export function auditText(text, refs, fileName = "/virtual/src/fixture.tsx") {
  const program = programFor({ [fileName]: text });
  const sf = program.getSourceFile(fileName);
  const checker = program.getTypeChecker();
  const ctx = { ...fileBindings(sf), checker };
  const rawTripCall = [];
  const unresolved = [];
  let hooks = 0;
  walk(sf, (node) => {
    // A cast that makes a client look trip-aware counts unless the client already is.
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && isTaggedType(node.type, ctx)) {
      if (!taggedReceiver(node.expression, ctx, checker)) rawTripCall.push(lineOf(sf, node));
      return;
    }
    // `as any` / `as never` lets a plain client into a slot typed TripConvexClient, which the receiver rules then trust.
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && isLooseType(node.type)) {
      if (isTaggedType(slotTypeOf(node, checker), ctx) && !taggedReceiver(node.expression, ctx, checker)) rawTripCall.push(lineOf(sf, node));
      return;
    }
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    let hook;
    if (ts.isIdentifier(callee)) hook = ctx.hookNames.get(callee.text);
    else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ctx.reactNs.has(callee.expression.text) && HOOKS.has(callee.name.text)) hook = callee.name.text;
    const client = ts.isPropertyAccessExpression(callee) && CLIENT_CALLS.has(callee.name.text) && !(ts.isIdentifier(callee.expression) && ctx.reactNs.has(callee.expression.text));
    if (hook) hooks++;
    if (!hook && !client) return;
    if (client && taggedReceiver(callee.expression, ctx, checker)) return;
    const first = node.arguments[0];
    const paths = first && refPaths(first, ctx);
    if (!paths) unresolved.push(lineOf(sf, node));
    else if (paths.some((p) => refs.has(p))) rawTripCall.push(lineOf(sf, node));
  });
  const allowed = [];
  const staleMarker = [];
  for (const marker of markersOf(sf)) {
    const hit = marker.reason === null ? -1 : rawTripCall.indexOf(marker.line + 1);
    if (hit === -1) {
      staleMarker.push(marker.line);
      continue;
    }
    rawTripCall.splice(hit, 1);
    allowed.push({ line: marker.line + 1, reason: marker.reason });
  }
  return { rawTripCall, unresolved, hooks, allowed, staleMarker };
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
  const allowed = {};
  const staleMarker = {};
  for (const file of targets ?? scanned) {
    const result = auditText(readFileSync(join(root, file), "utf8"), refs, join(root, file));
    const { rawTripCall, unresolved: lost, hooks } = result;
    if (rawTripCall.length > 0) files[file] = { rawTripCall: rawTripCall.length, lines: rawTripCall };
    if (lost.length > 0) unresolved[file] = lost;
    if (result.allowed.length > 0) allowed[file] = result.allowed;
    if (result.staleMarker.length > 0) staleMarker[file] = result.staleMarker;
    if (hooks > 0) folders[folderOf(file)] = (folders[folderOf(file)] ?? 0) + hooks;
  }
  const count = (byFile) => Object.values(byFile).reduce((n, v) => n + v.length, 0);
  const total = {
    rawTripCall: Object.values(files).reduce((n, v) => n + v.rawTripCall, 0),
    unresolved: count(unresolved),
    staleMarker: count(staleMarker),
    allowed: count(allowed),
  };
  return { files, unresolved, allowed, staleMarker, folders, total, scanned: (targets ?? scanned).length, tripRefs: refs.size };
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
  if (result.total.staleMarker > 0) process.exitCode = 1;
  if (args.includes("--json")) return console.log(JSON.stringify(result, null, 2));
  for (const [file, { rawTripCall }] of Object.entries(result.files)) console.log(`${file}: rawTripCall=${rawTripCall}`);
  for (const [file, lines] of Object.entries(result.unresolved)) console.log(`${file}: unresolved=${lines.length} (lines ${lines.join(",")})`);
  for (const [file, lines] of Object.entries(result.staleMarker)) console.log(`${file}: staleMarker=${lines.length} (lines ${lines.join(",")})`);
  if (args.includes("--allowed")) {
    for (const [file, entries] of Object.entries(result.allowed)) for (const { line, reason } of entries) console.log(`allowed ${file}:${line} ${reason}`);
    console.log(`allowed=${result.total.allowed}`);
  }
  if (args.includes("--folders")) for (const [folder, hooks] of Object.entries(result.folders).sort()) console.log(`${folder}: hooks=${hooks}`);
  console.log(`TOTAL rawTripCall=${result.total.rawTripCall} unresolved=${result.total.unresolved} staleMarker=${result.total.staleMarker}`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
