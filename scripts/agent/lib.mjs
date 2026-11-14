import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function isMain(metaUrl) {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

export function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

export function flagValue(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

export function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}
