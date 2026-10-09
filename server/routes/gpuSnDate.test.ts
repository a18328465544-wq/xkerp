import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerGpuSnDateRoutes} from "./gpuSnDate.ts";

test("GPU SN routes are permission-gated, and only estimate save requires inventory permission", () => {
  const routes: Array<{method: string; path: string; handlers: RequestHandler[]}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {routes.push({method: "GET", path, handlers}); return this;},
    post(path: string, ...handlers: RequestHandler[]) {routes.push({method: "POST", path, handlers}); return this;},
  } as unknown as Express;
  const menuGuards: string[][] = [];
  registerGpuSnDateRoutes(app, {
    requireMenu: (menu) => {menuGuards.push([menu]); return (_req, _res, next) => next();},
    requireAnyMenu: (menus) => {menuGuards.push(menus); return (_req, _res, next) => next();},
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
  });
  assert.deepEqual(routes.map(({method, path}) => [method, path]), [
    ["GET", "/api/gpu-sn/rules"], ["POST", "/api/gpu-sn/parse"], ["POST", "/api/gpu-sn/estimate/save"],
  ]);
  assert.deepEqual(menuGuards[0], ["inventory", "purchase_add", "purchase_list", "inspections", "sales_add", "sales_outbound", "aftersales"]);
  assert.deepEqual(menuGuards[1], menuGuards[0]);
  assert.deepEqual(menuGuards[2], ["inventory"]);
  assert.equal(routes[0]?.handlers.length, 2);
  assert.equal(routes[2]?.handlers.length, 2);
});
