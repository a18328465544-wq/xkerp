import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {createInitialState, createStoreActions} from "../store.ts";
import {registerProductBrandCatalogRoutes} from "./productBrandCatalog.ts";

test("brand persistence failure restores catalog, products and logs and releases the claim", async () => {
  const state = createInitialState({includeDemoData: true}), actions = createStoreActions(state);
  const owner = state.systemUsers.find(user => user.role === "老板")!, before = structuredClone(state);
  let handler: RequestHandler | undefined, released = 0;
  const app = {get() {}, post(path: string, route: RequestHandler) {if (path === "/api/product-brands") handler = route;}} as unknown as Express;
  registerProductBrandCatalogRoutes(app, {asyncRoute: route => route, getState: () => state, actions: () => actions, claimMutationIdempotency: async () => ({request: {tenantId: "test", route: "/api/product-brands", key: "failure", requestHash: "test"}}), releaseMutationIdempotency: async () => {released += 1;}, transactionHookWithIdempotency: () => undefined, saveRecords: async () => {throw new Error("injected SQL failure");}});
  const req = {authUser: owner, body: {name: "新品牌", aliases: []}} as AuthenticatedRequest<typeof owner>;
  assert.ok(handler);
  await assert.rejects(async () => {await handler!(req, {} as never, () => {});}, /injected SQL failure/);
  assert.deepEqual(state, before); assert.equal(released, 1);
});
