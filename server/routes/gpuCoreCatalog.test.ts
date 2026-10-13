import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {createInitialState, createStoreActions} from "../store.ts";
import {registerGpuCoreCatalogRoutes} from "./gpuCoreCatalog.ts";

test("catalog persistence failure restores metadata, log and product state and releases the claim", async () => {
  const state = createInitialState({includeDemoData: true});
  // Production actions are initialized before serving requests (normalizes legacy state).
  const actions = createStoreActions(state);
  const before = structuredClone(state);
  const owner = state.systemUsers.find(user => user.role === "老板")!;
  let handler: RequestHandler | undefined;
  let released = 0;
  const app = {get() {}, post(path: string, route: RequestHandler) {if (path === "/api/gpu-cores") handler = route;}} as unknown as Express;
  registerGpuCoreCatalogRoutes(app, {
    asyncRoute: route => route, getState: () => state, actions: () => actions,
    claimMutationIdempotency: async () => ({request: {tenantId: "test", route: "/api/gpu-cores", key: "failure", requestHash: "test"}}),
    releaseMutationIdempotency: async () => {released += 1;}, transactionHookWithIdempotency: () => undefined,
    saveRecords: async () => {throw new Error("injected SQL failure");},
  });
  assert.ok(handler);
  const req = {authUser: owner, body: {vendor: "NVIDIA", model: "rtx2080ti", specs: []}} as AuthenticatedRequest<typeof owner>;
  await assert.rejects(async () => {await handler!(req, {} as never, () => {});}, /injected SQL failure/);
  assert.equal(released, 1);
  assert.deepEqual(state, before);
});
