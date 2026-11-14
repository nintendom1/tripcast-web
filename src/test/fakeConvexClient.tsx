import { useEffect, useMemo, useReducer } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";

/** One request the app sent: a new subscription (`watch`), a one-shot `query`, a `mutation` or an `action`. */
export type FakeRequest = { kind: "watch" | "query" | "mutation" | "action"; name: string; args: Record<string, unknown> };

/** What the fake server answers for `name(args)`: `undefined` keeps a query loading; an `Error` is thrown. */
export type FakeAnswer = (name: string, args: Record<string, unknown>) => unknown;

type Subscription = { name: string; args: Record<string, unknown>; listeners: Set<() => void> };
type Ref = FunctionReference<"query" | "mutation" | "action">;
type Args = Record<string, unknown>;

const keyOf = (name: string, args: Args) => `${name}:${JSON.stringify(args, Object.keys(args).sort())}`;

/**
 * Tests only: a counting fake Convex server behind `fakeConvexReact` (a stand-in for `convex/react`; tests install it
 * with `vi.mock("convex/react", ...)`). Like the real client it holds ONE subscription per distinct function and
 * arguments however many components watch it, opens it when the first watcher subscribes and closes it with the last.
 * `log` lists every request in order; `active()` the subscriptions open now. `answer` decides each result; call
 * `update()` after changing what it returns.
 */
export function createFakeConvexClient(answer: FakeAnswer = () => undefined) {
  const log: FakeRequest[] = [];
  const subscriptions = new Map<string, Subscription>();
  const result = (name: string, args: Args) => {
    const value = answer(name, args);
    if (value instanceof Error) throw value;
    return value;
  };
  const oneShot = (kind: "query" | "mutation" | "action") => (ref: Ref, args: Args = {}) => {
    const name = getFunctionName(ref);
    log.push({ kind, name, args });
    try {
      return Promise.resolve(result(name, args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const fake = {
    log,
    result,
    query: oneShot("query"),
    mutation: oneShot("mutation"),
    action: oneShot("action"),
    subscribe(name: string, args: Args, listener: () => void): () => void {
      const key = keyOf(name, args);
      let subscription = subscriptions.get(key);
      if (!subscription) {
        subscription = { name, args, listeners: new Set() };
        subscriptions.set(key, subscription);
        log.push({ kind: "watch", name, args });
      }
      const current = subscription;
      current.listeners.add(listener);
      return () => {
        current.listeners.delete(listener);
        if (current.listeners.size === 0) subscriptions.delete(key);
      };
    },
    /** Subscriptions open right now, one per distinct function and arguments. */
    active: () => [...subscriptions.values()].map(({ name, args }) => ({ name, args })),
    /** Re-reads every open subscription's answer (after the test changed what `answer` returns). */
    update: () => [...subscriptions.values()].forEach((s) => [...s.listeners].forEach((listener) => listener())),
  };
  installed = fake;
  return fake;
}

export type FakeConvexClient = ReturnType<typeof createFakeConvexClient>;

let installed: FakeConvexClient | null = null;
function client(): FakeConvexClient {
  if (!installed) throw new Error("fakeConvexClient: call createFakeConvexClient() before rendering");
  return installed;
}

/** `"kind name(sorted arg keys)"`: what the startup request log compares (functions, argument keys, count). */
export function requestShape(request: FakeRequest): string {
  return `${request.kind} ${request.name}(${Object.keys(request.args).sort().join(",")})`;
}

function useWatch(name: string | null, args: Args | null): void {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const key = name && args ? keyOf(name, args) : null;
  useEffect(() => {
    if (!name || !args) return;
    return client().subscribe(name, args, rerender);
    // The key stands for name and args.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function useQuery(ref: Ref, args?: Args | "skip") {
  const name = getFunctionName(ref);
  const queryArgs = args === "skip" ? null : (args ?? {});
  useWatch(name, queryArgs);
  return queryArgs ? client().result(name, queryArgs) : undefined;
}

function usePaginatedQuery(ref: Ref, args: Args | "skip", options: { initialNumItems: number }) {
  const name = getFunctionName(ref);
  const base = args === "skip" ? null : args;
  // The first page only: one subscription per paginated query, as the real hook holds before `loadMore`.
  const first = base ? { ...base, paginationOpts: { numItems: options.initialNumItems, cursor: null } } : null;
  useWatch(name, first);
  const page = first ? (client().result(name, first) as { page: unknown[]; isDone: boolean } | undefined) : undefined;
  return {
    results: page?.page ?? [],
    status: page === undefined ? "LoadingFirstPage" : page.isDone ? "Exhausted" : "CanLoadMore",
    isLoading: page === undefined,
    loadMore: () => {},
  };
}

function useMutation(ref: Ref) {
  return useMemo(() => (args?: Args) => client().mutation(ref, args), [ref]);
}

function useAction(ref: Ref) {
  return useMemo(() => (args?: Args) => client().action(ref, args), [ref]);
}

function useConvex() {
  return useMemo(
    () => ({
      query: (ref: Ref, args?: Args) => client().query(ref, args),
      mutation: (ref: Ref, args?: Args) => client().mutation(ref, args),
      action: (ref: Ref, args?: Args) => client().action(ref, args),
    }),
    [],
  );
}

/** The `convex/react` stand-in: `vi.mock("convex/react", async () => (await import("./test/fakeConvexClient")).fakeConvexReact)`. */
export const fakeConvexReact = {
  useQuery,
  usePaginatedQuery,
  useMutation,
  useAction,
  useConvex,
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
};
