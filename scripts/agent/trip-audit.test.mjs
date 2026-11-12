// @vitest-environment node
// Self-test of the receiver rules in trip-audit.mjs. Runs with `node --test scripts/agent/trip-audit.test.mjs`, and
// under vitest too (it uses the vitest globals there, node:test here; assertions are node:assert either way).
import assert from "node:assert/strict";
import * as nodeTest from "node:test";
import { auditText, markersOf, tripRefs } from "./trip-audit.mjs";

const { describe, it } = globalThis.describe ? globalThis : nodeTest;

const API = `
type Args = { token: string; tripId: string };
export const tripcastApi = {
  checkpoints: {
    listCheckpoints: (anyApi as any).checkpoints.listCheckpoints as FunctionReference<"query", "public", Args, null>,
    add: (anyApi as any).checkpoints.add as FunctionReference<"mutation", "public", { token: string; tripId?: string }, null>,
    mine: (anyApi as any).checkpoints.mine as FunctionReference<"query", "public", { token: string }, null>,
  },
};`;
const REFS = tripRefs(API);
const HEAD = `import { useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { tripcastApi } from "../convex/tripcastApi";
import { useTripConvex, type TripConvexClient } from "../convex/useTrip";
`;
const raw = (body) => auditText(HEAD + body, REFS).rawTripCall.length;
const lost = (body) => auditText(HEAD + body, REFS).unresolved.length;
const CALL = `tripcastApi.checkpoints.listCheckpoints, { token: "t" }`;

describe("trip-audit receivers", () => {
  it("(a) the result of useTripConvex() is trip-aware, directly or through a const", () => {
    assert.equal(raw(`function A() { return useTripConvex().query(${CALL}); }`), 0);
    assert.equal(raw(`function A() { const convex = useTripConvex(); return convex.query(${CALL}); }`), 0);
    assert.equal(raw(`function A() { const convex = useTripConvex(); const again = convex; return again.mutation(tripcastApi.checkpoints.add, { token: "t" }); }`), 0);
  });

  it("(b) an identifier or parameter typed TripConvexClient is trip-aware", () => {
    assert.equal(raw(`function A(client: TripConvexClient) { return client.query(${CALL}); }`), 0);
    assert.equal(raw(`function A(client?: TripConvexClient) { return client!.query(${CALL}); }`), 0);
    assert.equal(raw(`declare const shared: TripConvexClient; function A() { return shared.query(${CALL}); }`), 0);
    assert.equal(raw(`const client: TripConvexClient = make(); function A() { return client.action(${CALL}); }`), 0);
  });

  it("(c) the result of a function declared to return TripConvexClient is trip-aware", () => {
    assert.equal(raw(`function calls(c: ConvexReactClient): TripConvexClient { return c as never; }\nasync function A(c: ConvexReactClient) { return calls(c).query(${CALL}); }`), 0);
    assert.equal(raw(`function calls(c: ConvexReactClient): TripConvexClient { return c as never; }\nasync function A(c: ConvexReactClient) { const k = calls(c); return k.mutation(tripcastApi.checkpoints.add, { token: "t" }); }`), 0);
    assert.equal(raw(`const calls = (c: ConvexReactClient): TripConvexClient => c as never;\nasync function A(c: ConvexReactClient) { return calls(c).query(${CALL}); }`), 0);
  });

  it("a tagged receiver is also trip-aware when its ref cannot be resolved (not reported as unresolved)", () => {
    assert.equal(lost(`function A(client: TripConvexClient, ref: never) { return client.query(ref, {}); }`), 0);
    assert.equal(lost(`function A(client: ConvexReactClient, ref: never) { return client.query(ref, {}); }`), 1);
  });

  it("MUTATION CHECK: a plain useConvex() or ConvexReactClient receiver still counts", () => {
    assert.equal(raw(`function A() { const convex = useConvex(); return convex.query(${CALL}); }`), 1);
    assert.equal(raw(`function A(client: ConvexReactClient) { return client.query(${CALL}); }`), 1);
    assert.equal(raw(`function A() { return useConvex().mutation(tripcastApi.checkpoints.add, { token: "t" }); }`), 1);
    assert.equal(raw(`function make(c: ConvexReactClient): ConvexReactClient { return c; }\nfunction A(c: ConvexReactClient) { return make(c).query(${CALL}); }`), 1);
  });

  it("does not let a tagged name hide a plain client with the same name elsewhere in the file", () => {
    const body = `
function A() { const convex = useTripConvex(); return convex.query(${CALL}); }
function B() { const convex = useConvex(); return convex.query(${CALL}); }
function C(convex: TripConvexClient) { return convex.query(${CALL}); }
function D(convex: ConvexReactClient) { return convex.query(${CALL}); }`;
    const result = auditText(HEAD + body, REFS).rawTripCall;
    assert.equal(result.length, 2);
  });

  it("only trusts useTripConvex from the useTrip module", () => {
    const fake = `import { tripcastApi } from "../convex/tripcastApi";\nimport { useTripConvex } from "./elsewhere";\nfunction A() { return useTripConvex().query(${CALL}); }`;
    assert.equal(auditText(fake, REFS).rawTripCall.length, 1);
    const local = `import { useConvex } from "convex/react";\nimport { tripcastApi } from "../convex/tripcastApi";\nfunction useTripConvex() { return useConvex(); }\nfunction A() { return useTripConvex().query(${CALL}); }`;
    assert.equal(auditText(local, REFS).rawTripCall.length, 1);
  });

  it("refs without tripId are never counted, tagged receiver or not", () => {
    assert.equal(raw(`function A() { return useConvex().query(tripcastApi.checkpoints.mine, { token: "t" }); }`), 0);
  });
});

const HELPERS = `import { useConvex, usePaginatedQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { tripcastApi } from "../convex/tripcastApi";
import { tripClientFor, useTripConvex, useTripPaginatedQuery, type TripConvexClient } from "../convex/useTrip";
`;
const audit = (body) => auditText(HELPERS + body, REFS);
const PAGES = `tripcastApi.checkpoints.listCheckpoints, { token: "t" }, { initialNumItems: 5 }`;

describe("trip-audit helpers from useTrip", () => {
  it("trusts tripClientFor(client, tripId) only when imported from the useTrip module", () => {
    assert.equal(audit(`function A(c: ConvexReactClient) { return tripClientFor(c, "trip-a").query(${CALL}); }`).rawTripCall.length, 0);
    assert.equal(audit(`function A(c: ConvexReactClient) { const k = tripClientFor(c, "trip-a"); return k.mutation(tripcastApi.checkpoints.add, { token: "t" }); }`).rawTripCall.length, 0);
    const fake = `import { tripcastApi } from "../convex/tripcastApi";\nimport { tripClientFor } from "./elsewhere";\nfunction A(c) { return tripClientFor(c, "x").query(${CALL}); }`;
    assert.equal(auditText(fake, REFS).rawTripCall.length, 1);
  });

  it("never counts useTripPaginatedQuery; a plain usePaginatedQuery on a tripId ref still counts", () => {
    assert.equal(audit(`function A() { return useTripPaginatedQuery(${PAGES}); }`).rawTripCall.length, 0);
    assert.equal(audit(`function A() { return usePaginatedQuery(${PAGES}); }`).rawTripCall.length, 1);
  });

  it("trusts ReturnType<typeof useTripConvex>, destructured parameters and a ?? of trip-aware clients", () => {
    assert.equal(audit(`function A({ trip }: { trip: ReturnType<typeof useTripConvex> }) { return trip.query(${CALL}); }`).rawTripCall.length, 0);
    assert.equal(audit(`function A({ trip: pinned }: { trip?: TripConvexClient }) { const own = useTripConvex(); const t = pinned ?? own; return t.query(${CALL}); }`).rawTripCall.length, 0);
  });

  it("MUTATION CHECK: a destructured plain client, a ?? with a plain side, or ReturnType of another function still counts", () => {
    assert.equal(audit(`function A({ client }: { client: ConvexReactClient }) { return client.query(${CALL}); }`).rawTripCall.length, 1);
    assert.equal(audit(`function A({ trip }: { trip?: TripConvexClient }) { const t = trip ?? useConvex(); return t.query(${CALL}); }`).rawTripCall.length, 1);
    assert.equal(audit(`function A({ c }: { c: ReturnType<typeof useConvex> }) { return c.query(${CALL}); }`).rawTripCall.length, 1);
  });
});

describe("trip-audit casts", () => {
  it("MUTATION CHECK: a cast of a plain client to TripConvexClient counts as a hit, also through unknown", () => {
    assert.deepEqual(audit(`function A(c: ConvexReactClient) {\n  return c as TripConvexClient;\n}`).rawTripCall, [6]);
    assert.equal(audit(`function A(c: ConvexReactClient) { return { query: c.query } as unknown as TripConvexClient; }`).rawTripCall.length, 1);
    assert.equal(audit(`function A() { return useConvex() as TripConvexClient; }`).rawTripCall.length, 1);
  });

  it("a cast of a client that is already trip-aware does not count", () => {
    assert.equal(audit(`function A() { return useTripConvex() as TripConvexClient; }`).rawTripCall.length, 0);
    assert.equal(audit(`function A(c: ConvexReactClient) { return tripClientFor(c, "x") as unknown as TripConvexClient; }`).rawTripCall.length, 0);
  });
});

describe("trip-audit-ok markers", () => {
  const RAW = `const mutate = useConvex().mutation(tripcastApi.checkpoints.add, { token: "t" });`;

  it("a marker with a reason allows one hit on the next line and names it", () => {
    const result = audit(`function A() {\n  // trip-audit-ok: publisher names the shared trip itself\n  ${RAW}\n}`);
    assert.deepEqual(result.rawTripCall, []);
    assert.deepEqual(result.allowed, [{ line: 7, reason: "publisher names the shared trip itself" }]);
    assert.deepEqual(result.staleMarker, []);
  });

  it("MUTATION CHECK: a marker above a line without a hit is a staleMarker and allows nothing", () => {
    const result = audit(`function A() {\n  // trip-audit-ok: publisher names the shared trip itself\n  const x = 1;\n  ${RAW}\n}`);
    assert.deepEqual(result.staleMarker, [6]);
    assert.deepEqual(result.rawTripCall, [8]);
    assert.deepEqual(result.allowed, []);
  });

  it("MUTATION CHECK: a marker with no reason, or more than 12 words, is a staleMarker and the hit stays", () => {
    for (const comment of ["// trip-audit-ok:", "// trip-audit-ok:   ", `// trip-audit-ok: ${"word ".repeat(13)}`]) {
      const result = audit(`function A() {\n  ${comment}\n  ${RAW}\n}`);
      assert.deepEqual(result.staleMarker, [6], comment);
      assert.deepEqual(result.rawTripCall, [7], comment);
    }
    assert.equal(markersOf(`// trip-audit-ok: ${"word ".repeat(12)}`)[0].reason?.split(" ").length, 12);
  });

  it("one marker allows exactly one hit: a second hit on the same line still counts", () => {
    const result = audit(`function A() {\n  // trip-audit-ok: by design\n  ${RAW} ${RAW.replace("mutate", "again")}\n}`);
    assert.deepEqual(result.rawTripCall, [7]);
    assert.equal(result.allowed.length, 1);
  });

  it("covers a counted cast too", () => {
    const result = audit(`function A(c: ConvexReactClient) {\n  // trip-audit-ok: untagged path by design\n  return c as TripConvexClient;\n}`);
    assert.deepEqual(result.rawTripCall, []);
    assert.equal(result.allowed.length, 1);
  });
});
