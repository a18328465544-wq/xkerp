import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerMarketQuoteCategoryRoutes} from "./marketQuoteCategories.ts";

test("market quote category routes are menu-protected and mutations use the shared runner", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {registered.push({method: "GET", path, middlewareCount: handlers.length}); return this;},
    post(path: string, ...handlers: RequestHandler[]) {registered.push({method: "POST", path, middlewareCount: handlers.length}); return this;},
    patch(path: string, ...handlers: RequestHandler[]) {registered.push({method: "PATCH", path, middlewareCount: handlers.length}); return this;},
  } as unknown as Express;

  registerMarketQuoteCategoryRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: createInitialState,
    actions: () => ({}) as never,
    actorForRequest: () => "测试用户",
    listCategories: async () => [],
  });

  assert.deepEqual(registered, [
    {method: "GET", path: "/api/market-quote-categories", middlewareCount: 2},
    {method: "POST", path: "/api/market-quote-categories", middlewareCount: 2},
    {method: "PATCH", path: "/api/market-quote-categories/:id", middlewareCount: 2},
  ]);
});
