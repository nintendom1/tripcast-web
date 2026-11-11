// Trip-scoped Convex hooks (contract package WC; behaviour by W1).
//
// Every web call on a `tripcastApi` ref whose args accept `tripId` goes through these hooks, so the client always
// sends the trip it means (`scripts/agent/trip-audit.mjs` counts calls that bypass them). The types allow only such
// refs. WC ships them as pass-throughs to `convex/react` that add nothing; W1 makes them inject the trip.

import { useMemo } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType, FunctionType, OptionalRestArgs } from "convex/server";

/** A public Convex ref of the given kind. */
type AnyRef<Kind extends FunctionType> = FunctionReference<Kind, "public">;

/**
 * `F` when its args accept `tripId`, otherwise `never`, so passing a ref without `tripId` to a trip hook is a
 * type error (use plain `convex/react` for those).
 */
export type TripScopedRef<F extends AnyRef<FunctionType>> = "tripId" extends keyof FunctionArgs<F> ? F : never;

/**
 * Args of a trip-scoped call: the ref's args with `tripId` optional. When omitted, W1 injects the trip (see each
 * hook); an explicit `tripId` always wins (for example a preview of a card's trip). The type never forces it, so
 * card-menu calls (acting on a card's trip, not the viewed one) and destructive calls (delete, lifecycle, reset)
 * MUST pass `tripId` explicitly.
 */
export type TripArgs<F extends AnyRef<FunctionType>> = Omit<FunctionArgs<F>, "tripId"> & { tripId?: string };

/** The function `useTripMutation` returns: runs the mutation against the captured trip. */
export type TripMutation<M extends AnyRef<"mutation">> = (args: TripArgs<M>) => Promise<FunctionReturnType<M>>;

/** Imperative trip-scoped client returned by `useTripConvex`. */
export type TripConvexClient = {
  query<Q extends AnyRef<"query">>(ref: Q & TripScopedRef<Q>, args: TripArgs<Q>): Promise<FunctionReturnType<Q>>;
  mutation<M extends AnyRef<"mutation">>(ref: M & TripScopedRef<M>, args: TripArgs<M>): Promise<FunctionReturnType<M>>;
  action<A extends AnyRef<"action">>(ref: A & TripScopedRef<A>, args: TripArgs<A>): Promise<FunctionReturnType<A>>;
};

/**
 * `useQuery` for a trip-scoped ref. Final behaviour (W1): sends `tripId` = the context's `viewingTripId` unless
 * `args.tripId` is given, so the subscription follows the viewed trip. `"skip"` skips as in `useQuery`.
 * WC: pass-through to `useQuery`.
 */
export function useTripQuery<Q extends AnyRef<"query">>(
  ref: Q & TripScopedRef<Q>,
  args: TripArgs<Q> | "skip",
): FunctionReturnType<Q> | undefined {
  return useQuery(ref as Q, ...([args] as OptionalRestArgsOrSkip<Q>));
}

/**
 * `useMutation` for a trip-scoped ref. Final behaviour (W1): captures `tripId` (the context's `viewingTripId`)
 * **at render**, not at call time, so an open sheet keeps its target after a switch; `args.tripId` overrides it.
 * WC: pass-through to `useMutation`.
 */
export function useTripMutation<M extends AnyRef<"mutation">>(ref: M & TripScopedRef<M>): TripMutation<M> {
  const mutation = useMutation(ref as M);
  return useMemo<TripMutation<M>>(
    () => (args) => mutation(...([args] as OptionalRestArgs<M>)),
    [mutation],
  );
}

/**
 * `useConvex` for imperative trip-scoped calls (one-shot queries, mutations, actions). Final behaviour (W1): each
 * call sends the `tripId` captured at render unless `args.tripId` is given. WC: pass-through to `useConvex`.
 */
export function useTripConvex(): TripConvexClient {
  const convex = useConvex();
  return useMemo<TripConvexClient>(
    () => ({
      query: (ref, args) => convex.query(ref, ...([args] as OptionalRestArgs<typeof ref>)),
      mutation: (ref, args) => convex.mutation(ref, ...([args] as OptionalRestArgs<typeof ref>)),
      action: (ref, args) => convex.action(ref, ...([args] as OptionalRestArgs<typeof ref>)),
    }),
    [convex],
  );
}
