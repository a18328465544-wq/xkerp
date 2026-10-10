import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerCustomerCategoryRoutes} from "./customerCategories.ts";

test("customer category mutations are registered behind CRM access and the shared mutation runner", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    patch(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PATCH", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerCustomerCategoryRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: createInitialState,
    actions: () => ({}) as never,
    actorForRequest: () => "测试用户",
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/customer-categories", middlewareCount: 2},
    {method: "PATCH", path: "/api/customer-categories/:id", middlewareCount: 2},
  ]);
});
