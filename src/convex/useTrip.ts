// Trip-scoped Convex hooks (contract package WC; behaviour by W1).
//
// Every web call on a `tripcastApi` ref whose args accept `tripId` goes through these hooks, so the client always
// sends the trip it means (`scripts/agent/trip-audit.mjs` counts calls that bypass them). The types allow only such
// refs. WC ships them as pass-throughs to `convex/react` that add nothing; W1 makes them inject the trip.
//
// The hooks read the context through the non-throwing `useOptionalTripContext`: with no `TripContextProvider`
// mounted they add no `tripId`, capture no target and pass calls straight through, exactly like plain
// `convex/react` hooks, so component tests and stories need no wrapper. (`useTripContext` itself still throws.)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { OptionalRestArgsOrSkip } from "convex/react";
import type { TripTarget } from "../features/trips/tripTypes";
import { useOptionalTripContext } from "../providers/TripContextProvider";
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

/** `TripMutation` that also carries the trip captured when the hook mounted. */
export type CapturedTripMutation<M extends AnyRef<"mutation">> = TripMutation<M> & {
  /** The trip this mutation writes to unless `args.tripId` is given; `null` when untagged. */
  target: TripTarget | null;
  /** Re-capture the trip being viewed right now (rare: use it only to deliberately retarget). */
  recapture: () => void;
};

/** `TripConvexClient` that also carries the trip captured when the hook mounted. */
export type CapturedTripConvexClient = TripConvexClient & {
  /** The trip these calls use unless `args.tripId` is given; `null` when untagged. */
  target: TripTarget | null;
  /** Re-capture the trip being viewed right now (rare: use it only to deliberately retarget). */
  recapture: () => void;
};

/**
 * Adds `tripId` to `args` unless the caller gave one or no trip applies. When no trip applies (multi-trip disabled,
 * or a Follower) args are returned untouched, so the call is exactly what it was before multi-trip.
 */
function withTrip<A extends { tripId?: string }>(args: A, tripId: string | null | undefined): A {
  if (!tripId || args.tripId !== undefined) return args;
  return { ...args, tripId };
}

type Captured = { target: TripTarget | null; sendTripId: string | null };

/**
 * Captures the viewed trip ONCE per mount (state initialised on the first render), not per render: a mounted sheet
 * that re-renders after the context changes keeps its original trip. `recapture()` takes the current view instead.
 * Followers never send a `tripId` (the server resolves them to the shared trip) but keep the target for labels.
 */
function useCapturedTrip(): Captured & { recapture: () => void } {
  const { role, viewingTrip } = useOptionalTripContext();
  const read = (): Captured => ({
    target: viewingTrip ? { tripId: viewingTrip.tripId, title: viewingTrip.title } : null,
    sendTripId: role === "follower" ? null : (viewingTrip?.tripId ?? null),
  });
  const [captured, setCaptured] = useState<Captured>(read);
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  const recapture = useCallback(() => setCaptured(latest.current()), []);
  return useMemo(() => ({ ...captured, recapture }), [captured, recapture]);
}

/**
 * `useQuery` for a trip-scoped ref: sends `tripId` = the context's `viewingTripId` (the viewed trip for a Traveler)
 * unless `args.tripId` is given; no `tripId` while none is known (multi-trip disabled) and never for a Follower.
 * `"skip"` skips as in `useQuery`. The trip is part of the args, so a trip change re-subscribes and a previous
 * trip's result is never returned for the new one. With no `TripContextProvider` mounted it is plain `useQuery`
 * (no `tripId` added, same args object).
 */
export function useTripQuery<Q extends AnyRef<"query">>(
  ref: Q & TripScopedRef<Q>,
  args: TripArgs<Q> | "skip",
): FunctionReturnType<Q> | undefined {
  const { role, viewingTripId } = useOptionalTripContext();
  const tripArgs = args === "skip" ? "skip" : withTrip(args, role === "follower" ? null : viewingTripId);
  return useQuery(ref as Q, ...([tripArgs] as OptionalRestArgsOrSkip<Q>));
}

/**
 * `useMutation` for a trip-scoped ref: captures the viewed trip **once when the hook mounts**, not at call time and
 * not on later renders, so an open sheet keeps writing to its trip after a switch; `args.tripId` overrides it. The
 * captured `{tripId, title}` is `.target`; `.recapture()` deliberately retargets to the current view.
 *
 * Call it in the sheet or editor component that is mounted per open. A long-lived parent must not hold this hook
 * for sheets it opens later: it would capture the trip once, at the parent's mount. With no `TripContextProvider`
 * mounted it is plain `useMutation` (no `tripId`, `target` null).
 */
export function useTripMutation<M extends AnyRef<"mutation">>(ref: M & TripScopedRef<M>): CapturedTripMutation<M> {
  const mutation = useMutation(ref as M);
  const { target, sendTripId, recapture } = useCapturedTrip();
  return useMemo(() => {
    const run: TripMutation<M> = (args) => mutation(...([withTrip(args, sendTripId)] as OptionalRestArgs<M>));
    return Object.assign(run, { target, recapture });
  }, [mutation, target, sendTripId, recapture]);
}

/**
 * `useConvex` for imperative trip-scoped calls (one-shot queries, mutations, actions): each call sends the `tripId`
 * captured when the hook mounted unless `args.tripId` is given. Same capture rules as `useTripMutation`: call it in
 * the component that owns the editor, not in a long-lived parent. With no `TripContextProvider` mounted it is plain
 * `useConvex` (no `tripId`, `target` null).
 */
export function useTripConvex(): CapturedTripConvexClient {
  const convex = useConvex();
  const { target, sendTripId, recapture } = useCapturedTrip();
  return useMemo<CapturedTripConvexClient>(
    () => ({
      target,
      recapture,
      query: (ref, args) => convex.query(ref, ...([withTrip(args, sendTripId)] as OptionalRestArgs<typeof ref>)),
      mutation: (ref, args) => convex.mutation(ref, ...([withTrip(args, sendTripId)] as OptionalRestArgs<typeof ref>)),
      action: (ref, args) => convex.action(ref, ...([withTrip(args, sendTripId)] as OptionalRestArgs<typeof ref>)),
    }),
    [convex, target, sendTripId, recapture],
  );
}
