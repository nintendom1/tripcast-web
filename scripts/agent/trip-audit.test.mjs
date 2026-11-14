// @vitest-environment node
// Self-test of the receiver rules in trip-audit.mjs. Runs with `node --test scripts/agent/trip-audit.test.mjs`, and
// under vitest too (it uses the vitest globals there, node:test here; assertions are node:assert either way).
import assert from "node:assert/strict";
import * as nodeTest from "node:test";
import { auditText, tripRefs } from "./trip-audit.mjs";

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
