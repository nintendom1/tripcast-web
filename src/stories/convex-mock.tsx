import React, { createContext, useContext, useState } from "react";
const ConvexMockContext = createContext<any>({ queries: new Map(), mutations: new Map(), setQueryMock: () => {}, setMutationMock: () => {} });
export const useQuery = (query: any, args: any) => {
  const context = useContext(ConvexMockContext);
  if (args === "skip") return undefined;
  if (context.queries.has(query)) return context.queries.get(query);
  return undefined;
};
export const useMutation = (mutation: any) => {
  const context = useContext(ConvexMockContext);
  if (context.mutations.has(mutation)) {
    const mock = context.mutations.get(mutation);
    if (typeof mock === "function") return mock;
    return async () => mock;
  }
  return async () => null;
};
export const useQueries = (queries: Record<string, any>) => {
    const context = useContext(ConvexMockContext);
    const results: Record<string, any> = {};
    for (const [key, value] of Object.entries(queries)) {
        const { query, args } = value as any;
        if (args === "skip") results[key] = undefined;
        else if (context.queries.has(query)) results[key] = context.queries.get(query);
        else results[key] = undefined;
    }
    return results;
};
export function ConvexProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export function StorybookConvexProvider({ children }: { children: React.ReactNode }) {
  const [queries] = useState(() => new Map());
  const [mutations] = useState(() => new Map());
  const setQueryMock = (query: any, result: any) => queries.set(query, result);
  const setMutationMock = (mutation: any, result: any) => mutations.set(mutation, result);
  return ( <ConvexMockContext.Provider value={{ queries, mutations, setQueryMock, setMutationMock }}>{children}</ConvexMockContext.Provider> );
}
export const useConvexMock = () => useContext(ConvexMockContext);
