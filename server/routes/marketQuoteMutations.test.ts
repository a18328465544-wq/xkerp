import assert from "node:assert/strict";
import test from "node:test";
import express, {type Express, type RequestHandler} from "express";
import {registerMarketQuoteMutationRoutes, projectMarketQuoteMutationResponse} from "./marketQuoteMutations.ts";
import type {AppState} from "../store.ts";
import {createInitialState, createStoreActions} from "../store.ts";
import type {MarketQuote, SystemUserAccount} from "../../src/types.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {createServer} from "node:http";
import type {StateRecordSave} from "../db.ts";
import {ConflictError, toDomainError} from "../errors.ts";
import {hashIdempotencyPayload} from "../commercialRepository.ts";
import {statePatchResponse} from "../statePatch.ts";
import {coreQuoteProfile} from "../../src/utils/quoteReference.ts";

test("market quote mutations preserve import validation and delete protection", () => {
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
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerMarketQuoteMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({marketQuotes: []} as unknown as AppState),
    actions: () => ({}) as never,
    deleteMerge: () => ({}),
    notifyPriceChanged: async () => undefined,
    notifyPriceChanges: async () => undefined,
    sendValidationError: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/market-quotes", middlewareCount: 3},
    {method: "POST", path: "/api/market-quotes/import", middlewareCount: 3},
    {method: "PATCH", path: "/api/market-quotes/:id", middlewareCount: 3},
    {method: "DELETE", path: "/api/market-quotes/:id", middlewareCount: 4},
  ]);
});

async function routeFixture(idempotencyEnabled = false) {
  const state = createInitialState({includeDemoData: true});
  state.marketQuotes = [];
  createStoreActions(state);
  const owner = state.systemUsers.find(user => user.role === "老板")!;
  let user = owner;
  let failPersistence = false;
  let downgradeOnSave = false;
  let failTransactionHook = false;
  let failCategoryHook = false;
  const counters = {claims: 0, releases: 0, hooks: 0, categories: 0, notifications: 0};
  const receipts = new Map<string, {requestHash: string; statusCode: number; response: unknown}>();
  const locks = new Set<string>();
  let stagedReceipt: {key: string; requestHash: string; statusCode: number; response: unknown} | undefined;
  const persisted: StateRecordSave[][] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {(req as AuthenticatedRequest<SystemUserAccount>).authUser = user; next();});
  registerMarketQuoteMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(), requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: handler => (req, res, next) => {Promise.resolve(handler(req, res, next)).catch(next);},
    getState: () => state, actions: () => createStoreActions(state), deleteMerge: () => ({inventory: state.inventory, products: state.products}),
    notifyPriceChanged: () => {counters.notifications += 1;}, notifyPriceChanges: () => {counters.notifications += 1;}, sendValidationError: () => {},
    ...(idempotencyEnabled ? {
      claimMutationIdempotency: async (req: AuthenticatedRequest<SystemUserAccount>) => {
        counters.claims += 1;
        const rawKey = req.headers["idempotency-key"];
        if (!rawKey) return null;
        const request = {tenantId: "test", route: req.path, key: String(rawKey), requestHash: hashIdempotencyPayload(req.body ?? null)};
        const key = `${request.route}|${request.key}`;
        const receipt = receipts.get(key);
        if (receipt) {
          if (receipt.requestHash !== request.requestHash) throw new ConflictError("幂等键请求不一致");
          return {request, replay: {statusCode: receipt.statusCode, response: structuredClone(receipt.response)}};
        }
        if (locks.has(key)) throw new ConflictError("幂等键处理中");
        locks.add(key);
        return {request};
      },
      releaseMutationIdempotency: async (context: {request: {route: string; key: string}} | null) => {
        counters.releases += 1;
        if (context) locks.delete(`${context.request.route}|${context.request.key}`);
      },
      transactionHookWithIdempotency: (context, statusCode, categoryHook) => async (client, data, patch) => {
        counters.hooks += 1;
        await categoryHook?.(client, data, patch);
        if (failTransactionHook) throw new Error("receipt hook failed");
        if (context && patch) stagedReceipt = {key: `${context.request.route}|${context.request.key}`, requestHash: context.request.requestHash, statusCode, response: structuredClone(statePatchResponse(data, patch.stateMerge, patch.stateDelete))};
      },
    } : {}),
    saveRecords: async (records, hook) => {
      stagedReceipt = undefined;
      if (failPersistence) throw new Error("local persistence failed");
      if (idempotencyEnabled) await hook?.({query: async () => {
        counters.categories += 1;
        if (failCategoryHook) throw new Error("category hook failed");
        return {rows: [{id: "MQC-TEST", is_active: true}]};
      }} as never);
      persisted.push(structuredClone(records));
      if (stagedReceipt) {
        receipts.set(stagedReceipt.key, stagedReceipt);
        locks.delete(stagedReceipt.key);
      }
      if (downgradeOnSave) user.permissionOverrides = {...user.permissionOverrides, showCost: false, showProfit: false};
    },
  });
  app.use(((error: unknown, _req: unknown, res: express.Response, _next: unknown) => {
    const mapped = toDomainError(error);
    res.status(mapped.status).json({error: {code: mapped.code, message: mapped.message}});
  }) as express.ErrorRequestHandler);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = (path: string, method: string, body?: unknown, key?: string) => fetch(`http://127.0.0.1:${address.port}${path}`, {method, headers: {"content-type": "application/json", ...(key ? {"idempotency-key": key} : {})}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
  const command = {model: "RTX 5090", brand: "NVIDIA", quoteScope: "core", coreModel: "RTX 5090",
    profile: {condition: "used", grade: "95新", warranty: "any", packaging: "any", vram: "32G", currency: "CNY"}, source: "测试报价",
    refBuyPrice: null, refSellPrice: 22000, trend: "up", updateTime: "2026-10-13"};
  return {state, request, command, persisted, counters, receipts, locks,
    setUser: (next: SystemUserAccount) => {user = next;},
    restrict: (showCost: boolean, showProfit: boolean) => {user = {...state.systemUsers.find(item => item.role === "店员")!, permissionOverrides: {allowedMenus: ["quotes", "logs"], showCost, showProfit, canDelete: true}};},
    fail: () => {failPersistence = true;},
    failHook: () => {failTransactionHook = true;},
    failCategory: () => {failCategoryHook = true;},
    repair: () => {failPersistence = false; failTransactionHook = false; failCategoryHook = false;},
    downgrade: () => {downgradeOnSave = true;},
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

function seedRouteCore(state: AppState) {
  return createStoreActions(state).createMarketQuote({model: "RTX5080", coreModel: "RTX5080", quoteScope: "core", source: "门店", refBuyPrice: 1, refSellPrice: 2});
}

test("behavioral POST PATCH IMPORT DELETE deny each missing price permission before mutation/persistence", async () => {
  const fixture = await routeFixture();
  try {
    for (const [showCost, showProfit] of [[false, false], [true, false], [false, true]]) {
      fixture.restrict(showCost, showProfit);
      const before = structuredClone(fixture.state);
      for (const [path, method, body] of [["/api/market-quotes", "POST", fixture.command], ["/api/market-quotes/import", "POST", {quotes: [fixture.command]}], ["/api/market-quotes/MQ-1", "PATCH", {todayBuyPrice: 1, todaySellPrice: 2}], ["/api/market-quotes/MQ-1", "DELETE", undefined]] as const) {
        const response = await fixture.request(path, method, body);
        assert.equal(response.status, 403);
        const payload = await response.json() as Record<string, unknown>;
        assert.equal("data" in payload, false);
        assert.equal("stateMerge" in payload, false);
        assert.deepEqual(fixture.state, before);
        assert.equal(fixture.persisted.length, 0);
      }
    }
  } finally {await fixture.close();}
});

test("route create/update/import/delete persist only quotes and all new logs, stock facts stay unchanged", async () => {
  const fixture = await routeFixture();
  try {
    assert.ok(fixture.state.inventory.length && fixture.state.products.length);
    const facts = structuredClone({products: fixture.state.products, inventory: fixture.state.inventory});
    const createdResponse = await fixture.request("/api/market-quotes", "POST", fixture.command);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as {data: MarketQuote; stateMerge: Record<string, unknown>};
    assert.equal(created.data.coreId, "GPU-NVIDIA-RTX5090");
    assert.equal(created.data.refBuyPrice, null);
    assert.equal(created.data.trend, "stable");
    assert.equal("inventory" in created.stateMerge, false);
    assert.equal("products" in created.stateMerge, false);
    assert.equal((await fixture.request(`/api/market-quotes/${created.data.id}`, "PATCH", {todayBuyPrice: 21000, todaySellPrice: null})).status, 200);
    assert.equal((await fixture.request("/api/market-quotes/import", "POST", {quotes: [fixture.command, {...fixture.command, coreModel: "RTX 5090D", model: "RTX 5090D"}]})).status, 201);
    assert.equal(fixture.persisted.at(-1)?.find(record => record.key === "logs")?.items.length, 3);
    assert.equal((await fixture.request(`/api/market-quotes/${created.data.id}`, "DELETE")).status, 200);
    for (const records of fixture.persisted) for (const record of records) assert.ok(["marketQuotes", "logs"].includes(record.key));
    assert.deepEqual({products: fixture.state.products, inventory: fixture.state.inventory}, facts);
  } finally {await fixture.close();}
});

test("route legacy conversion passes sixth command argument and preserves qualified history", async () => {
  const fixture = await routeFixture();
  try {
    const legacy = {...createInitialState().marketQuotes[0]!, id: "HIST-LEGACY", model: "RTX 5090 legacy", quoteScope: undefined, coreId: undefined, coreModel: undefined, profile: undefined,
      productId: "", refBuyPrice: 1, refSellPrice: 2, history: [{date: "old", buyPrice: 1, sellPrice: 2}]};
    fixture.state.marketQuotes = [legacy];
    const {quoteScope, coreModel, source} = fixture.command;
    const response = await fixture.request(`/api/market-quotes/${legacy.id}`, "PATCH", {todayBuyPrice: null, todaySellPrice: 200, quoteScope, coreModel, profile: coreQuoteProfile(), source});
    assert.equal(response.status, 200);
    const payload = await response.json() as {data: MarketQuote};
    assert.equal(payload.data.quoteScope, "core");
    assert.deepEqual(payload.data.history?.[0], {date: "old", buyPrice: 1, sellPrice: 2});
    assert.ok(payload.data.history?.at(-1)?.quoteKey);
  } finally {await fixture.close();}
});

test("persistence errors restore create/import/update/delete including logs", async () => {
  const fixture = await routeFixture();
  try {
    const created = await (await fixture.request("/api/market-quotes", "POST", fixture.command)).json() as {data: MarketQuote};
    fixture.fail();
    const before = structuredClone(fixture.state);
    for (const [path, method, body] of [["/api/market-quotes", "POST", {...fixture.command, coreModel: "RTX 5090D"}], ["/api/market-quotes/import", "POST", {quotes: [fixture.command, {...fixture.command, coreModel: "RTX 5090D"}]}], [`/api/market-quotes/${created.data.id}`, "PATCH", {todayBuyPrice: 1, todaySellPrice: 2}], [`/api/market-quotes/${created.data.id}`, "DELETE", undefined]] as const) {
      assert.equal((await fixture.request(path, method, body)).status, 500);
      assert.deepEqual(fixture.state, before);
    }
  } finally {await fixture.close();}
});

test("response projection separates persisted facts from downgraded data/patch prices and log values", async () => {
  const fixture = await routeFixture();
  try {
    fixture.restrict(true, true);
    fixture.downgrade();
    const response = await fixture.request("/api/market-quotes", "POST", fixture.command);
    assert.equal(response.status, 201);
    const payload = await response.json() as {data: Record<string, unknown>; stateMerge: {marketQuotes: Array<Record<string, unknown>>; logs: Array<Record<string, unknown>>}};
    for (const row of [payload.data, ...payload.stateMerge.marketQuotes]) {
      assert.equal("refBuyPrice" in row, false);
      assert.equal("refSellPrice" in row, false);
      assert.ok((row.history as Array<Record<string, unknown>>).every(point => !("buyPrice" in point) && !("sellPrice" in point) && "quoteKey" in point));
    }
    assert.ok(payload.stateMerge.logs.every(log => !("beforeVal" in log) && !("afterVal" in log)));
    const facts = fixture.persisted[0].find(record => record.key === "marketQuotes")!.items[0] as MarketQuote;
    assert.equal(facts.refSellPrice, 22000);
    assert.equal(facts.refBuyPrice, null);
  } finally {await fixture.close();}
});

test("PATCH IMPORT DELETE response data and patches are projected again after permissions change", async () => {
  for (const method of ["PATCH", "IMPORT", "DELETE"]) {
    const fixture = await routeFixture();
    try {
      const created = await (await fixture.request("/api/market-quotes", "POST", fixture.command)).json() as {data: MarketQuote};
      fixture.restrict(true, true);
      fixture.downgrade();
      const response = method === "IMPORT"
        ? await fixture.request("/api/market-quotes/import", "POST", {quotes: [{...fixture.command, refBuyPrice: 20000}]})
        : await fixture.request(`/api/market-quotes/${created.data.id}`, method, method === "PATCH" ? {todayBuyPrice: 21000, todaySellPrice: 23000} : undefined);
      assert.equal(response.status, method === "IMPORT" ? 201 : 200);
      const payload = await response.json() as {data: Record<string, unknown>; stateMerge: {marketQuotes?: Array<Record<string, unknown>>; logs?: Array<Record<string, unknown>>}};
      const rows = method === "IMPORT" ? payload.data.quotes as Array<Record<string, unknown>> : [payload.data];
      for (const row of [...rows, ...(payload.stateMerge.marketQuotes || [])]) {
        for (const field of ["refBuyPrice", "refSellPrice", "todayBuyPrice", "todaySellPrice", "changeAmount", "changeRatio", "trend"]) assert.equal(field in row, false, `${method} ${field}`);
        assert.ok((row.history as Array<Record<string, unknown>>).every(point => !("buyPrice" in point) && !("sellPrice" in point) && "quoteKey" in point));
      }
      assert.ok(payload.stateMerge.logs?.every(log => !("beforeVal" in log) && !("afterVal" in log)));
      assert.equal("inventory" in payload.stateMerge, false);
      assert.equal("products" in payload.stateMerge, false);
    } finally {await fixture.close();}
  }
});

test("PATCH clears validity explicitly while omitted validity is preserved", async () => {
  const fixture = await routeFixture();
  try {
    const created = await (await fixture.request("/api/market-quotes", "POST", {...fixture.command, validUntil: "2026-12-31"})).json() as {data: MarketQuote};
    const path = `/api/market-quotes/${created.data.id}`;
    const unchanged = await (await fixture.request(path, "PATCH", {todayBuyPrice: 1, todaySellPrice: 2})).json() as {data: MarketQuote};
    assert.equal(unchanged.data.validUntil, "2026-12-31");
    const cleared = await (await fixture.request(path, "PATCH", {todayBuyPrice: 1, todaySellPrice: 2, validUntil: "", source: "新来源"})).json() as {data: MarketQuote};
    assert.equal(cleared.data.validUntil, undefined);
    assert.equal(cleared.data.source, "新来源");
  } finally {await fixture.close();}
});

test("POST PATCH IMPORT DELETE reuse atomic receipts without extra writes/history/logs/notifications", async () => {
  const fixture = await routeFixture(true);
  try {
    const created = await (await fixture.request("/api/market-quotes", "POST", fixture.command, "create-key")).json() as {data: MarketQuote};
    const operations = [
      ["/api/market-quotes", "POST", fixture.command, "create-key", 201],
      [`/api/market-quotes/${created.data.id}`, "PATCH", {todayBuyPrice: 100, todaySellPrice: 200}, "patch-key", 200],
      ["/api/market-quotes/import", "POST", {quotes: [{...fixture.command, refBuyPrice: 110, refSellPrice: 210}]}, "import-key", 201],
      [`/api/market-quotes/${created.data.id}`, "DELETE", undefined, "delete-key", 200],
    ] as const;
    for (const [path, method, body, key, status] of operations) {
      const first = await fixture.request(path, method, body, key);
      assert.equal(first.status, status);
      const expected = await first.json();
      const facts = structuredClone(fixture.state);
      const counts = {...fixture.counters, writes: fixture.persisted.length};
      const retry = await fixture.request(path, method, body, key);
      assert.equal(retry.status, status);
      assert.deepEqual(await retry.json(), expected);
      assert.deepEqual(fixture.state, facts);
      assert.equal(fixture.persisted.length, counts.writes);
      assert.equal(fixture.counters.hooks, counts.hooks);
      assert.equal(fixture.counters.notifications, counts.notifications);
      assert.equal(fixture.counters.releases, counts.releases);
    }
    assert.equal(fixture.receipts.size, 4);
    assert.equal(fixture.locks.size, 0);
    for (const batch of fixture.persisted) assert.ok(batch.every(record => ["marketQuotes", "logs"].includes(record.key)));
    const changed = await fixture.request("/api/market-quotes", "POST", {...fixture.command, refSellPrice: 999}, "create-key");
    assert.equal(changed.status, 409);
  } finally {await fixture.close();}
});

test("permissions and DTOs reject before claiming, including restricted receipt replays", async () => {
  const fixture = await routeFixture(true);
  try {
    for (const [path, method, body] of [["/api/market-quotes", "POST", {}], ["/api/market-quotes/import", "POST", {quotes: []}], ["/api/market-quotes/missing", "PATCH", {todayBuyPrice: null, todaySellPrice: null}], ["/api/market-quotes/missing", "DELETE", {unexpected: true}]] as const) {
      assert.equal((await fixture.request(path, method, body, "bad-body")).status, 400);
      assert.equal(fixture.counters.claims, 0);
    }
    assert.equal((await fixture.request("/api/market-quotes", "POST", fixture.command, "original")).status, 201);
    const facts = structuredClone(fixture.state);
    const claimed = fixture.counters.claims;
    fixture.restrict(false, false);
    const replay = await fixture.request("/api/market-quotes", "POST", fixture.command, "original");
    assert.equal(replay.status, 403);
    const payload = await replay.json() as Record<string, unknown>;
    assert.equal("data" in payload, false);
    assert.equal("stateMerge" in payload, false);
    assert.equal(fixture.counters.claims, claimed);
    assert.deepEqual(fixture.state, facts);
    for (const [path, method, body] of [["/api/market-quotes/import", "POST", {quotes: [fixture.command]}], ["/api/market-quotes/missing", "PATCH", {todayBuyPrice: 1, todaySellPrice: 2}], ["/api/market-quotes/missing", "DELETE", undefined]] as const) {
      assert.equal((await fixture.request(path, method, body, "restricted-key")).status, 403);
      assert.equal(fixture.counters.claims, claimed);
      assert.deepEqual(fixture.state, facts);
    }
  } finally {await fixture.close();}
});

test("PATCH and DELETE not-found receipts retain 404 even if a record exists later", async () => {
  for (const method of ["PATCH", "DELETE"]) {
    const fixture = await routeFixture(true);
    try {
      const path = "/api/market-quotes/missing";
      const body = method === "PATCH" ? {todayBuyPrice: 100, todaySellPrice: 200} : undefined;
      const first = await fixture.request(path, method, body, "missing-key");
      assert.equal(first.status, 404);
      const expected = await first.json();
      const created = seedRouteCore(fixture.state);
      fixture.state.marketQuotes[0] = {...created, id: "missing"};
      const facts = structuredClone(fixture.state);
      const retry = await fixture.request(path, method, body, "missing-key");
      assert.equal(retry.status, 404);
      assert.deepEqual(await retry.json(), expected);
      assert.deepEqual(fixture.state, facts);
      assert.equal(fixture.receipts.get(`${path}|missing-key`)?.statusCode, 404);
    } finally {await fixture.close();}
  }
});

test("failed receipt hooks/persistence restore state and release all four command claims for retry", async () => {
  for (const mode of ["hook", "persistence"]) for (const method of ["POST", "PATCH", "IMPORT", "DELETE"]) {
    const fixture = await routeFixture(true);
    try {
      const created = seedRouteCore(fixture.state);
      const path = method === "POST" ? "/api/market-quotes" : method === "IMPORT" ? "/api/market-quotes/import" : `/api/market-quotes/${created.id}`;
      const body = method === "POST" ? fixture.command : method === "IMPORT" ? {quotes: [fixture.command]} : method === "PATCH" ? {todayBuyPrice: 3, todaySellPrice: 4} : undefined;
      const verb = method === "IMPORT" ? "POST" : method;
      const before = structuredClone(fixture.state);
      if (mode === "hook") fixture.failHook(); else fixture.fail();
      assert.equal((await fixture.request(path, verb, body, "retry-key")).status, 500);
      assert.deepEqual(fixture.state, before);
      assert.equal(fixture.receipts.size, 0);
      assert.equal(fixture.persisted.length, 0);
      assert.equal(fixture.locks.size, 0);
      assert.equal(fixture.counters.releases, 1);
      fixture.repair();
      const retry = await fixture.request(path, verb, body, "retry-key");
      assert.equal(retry.status, method === "POST" || method === "IMPORT" ? 201 : 200);
      assert.equal(fixture.receipts.size, 1);
    } finally {await fixture.close();}
  }
});

test("category validation composes before receipt completion atomically for create/import/patch", async () => {
  for (const method of ["POST", "IMPORT", "PATCH"]) {
    const fixture = await routeFixture(true);
    try {
      const created = seedRouteCore(fixture.state);
      const path = method === "POST" ? "/api/market-quotes" : method === "IMPORT" ? "/api/market-quotes/import" : `/api/market-quotes/${created.id}`;
      const command = {...fixture.command, categoryId: "MQC-TEST"};
      const body = method === "POST" ? command : method === "IMPORT" ? {quotes: [command]} : {todayBuyPrice: 3, todaySellPrice: 4, categoryId: "MQC-TEST"};
      const verb = method === "IMPORT" ? "POST" : method;
      const facts = structuredClone(fixture.state);
      fixture.failCategory();
      assert.equal((await fixture.request(path, verb, body, "category-key")).status, 500);
      assert.ok(fixture.counters.categories > 0);
      assert.deepEqual(fixture.state, facts);
      assert.equal(fixture.receipts.size, 0);
      assert.equal(fixture.counters.releases, 1);
      fixture.repair();
      assert.equal((await fixture.request(path, verb, body, "category-key")).status, method === "PATCH" ? 200 : 201);
      assert.equal(fixture.receipts.size, 1);
    } finally {await fixture.close();}
  }
});

test("cached data/import/deletes are reprojected with current permissions and only quote/log patches", () => {
  const state = createInitialState({includeDemoData: true});
  const actor = {...state.systemUsers.find(user => user.role === "店员")!, permissionOverrides: {allowedMenus: ["quotes", "logs"], showCost: false, showProfit: false}};
  const quote = {...state.marketQuotes[0], refBuyPrice: null, refSellPrice: 22000, history: [{date: "2026-10-13", buyPrice: null, sellPrice: 22000, quoteKey: "qualified"}]};
  const log = {...state.logs[0], beforeVal: "回收参考 21000", afterVal: "销售参考 22000"};
  const merge = {marketQuotes: [quote], logs: [log], inventory: state.inventory, products: state.products, financeLedger: state.financeLedger};
  const before = structuredClone(merge);
  for (const data of [quote, {created: 1, updated: 0, skipped: 0, quotes: [quote]}]) {
    const result = projectMarketQuoteMutationResponse(state, {data, stateMerge: merge, stateDelete: {marketQuotes: [quote.id], inventory: ["must-not-delete"]}, state}, actor);
    const projectedData = result.data as MarketQuote | {quotes: MarketQuote[]};
    const rows = "quotes" in projectedData ? projectedData.quotes : [projectedData];
    for (const row of rows) {
      assert.equal("refBuyPrice" in row, false);
      assert.equal("refSellPrice" in row, false);
      assert.deepEqual(row.history, [{date: "2026-10-13", quoteKey: "qualified"}]);
    }
    assert.ok(Object.keys(result.stateMerge).every(key => ["marketQuotes", "logs"].includes(key)));
    assert.ok(result.stateMerge.logs?.every(row => !("beforeVal" in (row as object)) && !("afterVal" in (row as object))));
    assert.deepEqual(result.stateDelete, {marketQuotes: [quote.id]});
    assert.equal("state" in result, false);
    assert.deepEqual(merge, before);
  }
  const quotesOnly = {...actor, permissionOverrides: {allowedMenus: ["quotes"], showCost: true, showProfit: true}};
  const allowed = projectMarketQuoteMutationResponse(state, {data: quote, stateMerge: merge}, quotesOnly);
  assert.equal(allowed.stateMerge.logs, undefined);
  assert.deepEqual(merge, before);
});

test("HTTP core without profile and old physical variants replay; every product input is denied", async () => {
  const fixture = await routeFixture(true);
  try {
    const {profile, ...command} = fixture.command;
    const createdResponse = await fixture.request("/api/market-quotes", "POST", command, "core-base-key");
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as {data: MarketQuote};
    assert.deepEqual(created.data.profile, coreQuoteProfile());
    const facts = structuredClone(fixture.state);
    const replay = await fixture.request("/api/market-quotes", "POST", {...command, profile: {...profile, condition: "new", grade: "全新", warranty: "out", packaging: "unboxed", vram: "8G"}}, "core-base-key");
    assert.equal(replay.status, 201);
    assert.equal(((await replay.json()) as {data: MarketQuote}).data.id, created.data.id);
    assert.deepEqual(fixture.state, facts);
    assert.equal((await fixture.request("/api/market-quotes", "POST", {...command, profile})).status, 409);
    const path = `/api/market-quotes/${created.data.id}`;
    const prices = {todayBuyPrice: 100, todaySellPrice: 200};
    assert.equal((await fixture.request(path, "PATCH", prices, "core-patch-key")).status, 200);
    const afterPatch = structuredClone(fixture.state);
    assert.equal((await fixture.request(path, "PATCH", {...prices, profile: {invalid: "ignored"}}, "core-patch-key")).status, 200);
    assert.deepEqual(fixture.state, afterPatch);
    assert.equal((await fixture.request(path, "PATCH", {...prices, todayBuyPrice: 999}, "core-patch-key")).status, 409);
    const product = {...fixture.state.products[0], id: "REAL", name: "RTX5090", category: "显卡" as const, model: "RTX5090", vram: "32G"};
    fixture.state.products = [product];
    const specific = {...fixture.command, quoteScope: "product", productId: product.id};
    const before = structuredClone(fixture.state);
    const claims = fixture.counters.claims;
    assert.equal((await fixture.request("/api/market-quotes", "POST", specific, "product-key")).status, 400);
    assert.equal((await fixture.request("/api/market-quotes/import", "POST", {quotes: [fixture.command, specific]}, "product-import-key")).status, 400);
    assert.equal((await fixture.request(path, "PATCH", {...prices, quoteScope: "product"}, "product-patch-key")).status, 400);
    assert.equal((await fixture.request("/api/market-quotes", "POST", {...specific, profile: coreQuoteProfile()})).status, 400);
    assert.equal(fixture.counters.claims, claims);
    assert.deepEqual(fixture.state, before);
  } finally {await fixture.close();}
});

test("HTTP conditioned core cannot silently normalize; explicit conversion isolates history and conflicts require confirmation", async () => {
  const fixture = await routeFixture(true);
  try {
    const base = createStoreActions(fixture.state).createMarketQuote({...fixture.command, quoteScope: "core", profile: undefined, trend: "stable"});
    const old = {...base, profile: {...fixture.command.profile, condition: "used" as const, warranty: "any" as const, packaging: "any" as const, currency: "CNY" as const}, history: [{date: "old", buyPrice: 100, sellPrice: 200, quoteKey: `core|${base.coreId}|CNY`}]};
    fixture.state.marketQuotes = [old];
    const path = `/api/market-quotes/${old.id}`;
    const facts = structuredClone(fixture.state);
    const prices = {todayBuyPrice: 110, todaySellPrice: 210};
    for (const body of [prices, {...prices, quoteScope: "core"}, {...prices, quoteScope: "core", profile: old.profile}]) {
      const denied = await fixture.request(path, "PATCH", body, "unconfirmed-key");
      assert.equal(denied.status, 400);
      assert.match(await denied.text(), /请明确确认转换为核心基础价/);
      assert.deepEqual(fixture.state, facts);
      assert.equal(fixture.counters.claims, 0);
    }
    const converted = await fixture.request(path, "PATCH", {...prices, quoteScope: "core", profile: coreQuoteProfile()}, "confirmed-key");
    assert.equal(converted.status, 200);
    const data = (await converted.json() as {data: MarketQuote}).data;
    assert.deepEqual(data.profile, coreQuoteProfile());
    assert.equal(data.changeRatio, undefined);
    assert.match(data.history?.[0].quoteKey || "", /^conditioned-core\|/);
    assert.equal(fixture.counters.notifications, 0);
    fixture.state.marketQuotes = [old, {...base, id: "PEER"}];
    const conflictFacts = structuredClone(fixture.state);
    assert.equal((await fixture.request(path, "PATCH", {...prices, quoteScope: "core", profile: coreQuoteProfile()}, "conflict-key")).status, 409);
    assert.deepEqual(fixture.state, conflictFacts);
  } finally {await fixture.close();}
});

test("HTTP same-core different import prices conflict without saving any rows or receipt", async () => {
  const fixture = await routeFixture(true);
  try {
    const before = structuredClone(fixture.state);
    const response = await fixture.request("/api/market-quotes/import", "POST", {quotes: [fixture.command, {...fixture.command, refBuyPrice: 1, profile: {...fixture.command.profile, condition: "new", grade: "全新"}}]}, "conflicting-file");
    assert.equal(response.status, 409);
    assert.match(await response.text(), /明确选择一套核心基础价/);
    assert.deepEqual(fixture.state, before);
    assert.equal(fixture.persisted.length, 0);
    assert.equal(fixture.receipts.size, 0);
    assert.equal(fixture.locks.size, 0);
  } finally {await fixture.close();}
});

test("HTTP source-free import cannot silently confirm a pending historical core", async () => {
  const fixture = await routeFixture(true);
  try {
    const quote = createStoreActions(fixture.state).createMarketQuote({...fixture.command, quoteScope: "core", profile: coreQuoteProfile(), trend: "stable"});
    fixture.state.marketQuotes = [{...quote, profile: undefined}];
    const before = structuredClone(fixture.state);
    const {source: _source, ...command} = fixture.command;
    const response = await fixture.request("/api/market-quotes/import", "POST", {quotes: [command]}, "pending-source-free");
    assert.equal(response.status, 400);
    assert.match(await response.text(), /待确认/);
    assert.deepEqual(fixture.state, before);
    assert.equal(fixture.persisted.length, 0);
    assert.equal(fixture.receipts.size, 0);
    assert.equal(fixture.locks.size, 0);
  } finally {await fixture.close();}
});

test("HTTP default/explicit core and model casing replay canonically; changed economics still conflict", async () => {
  const fixture = await routeFixture(true);
  try {
    const {quoteScope: _scope, coreModel: _core, profile: _profile, ...base} = fixture.command;
    const body = {...base, model: "rtx4070ti"};
    const first = await fixture.request("/api/market-quotes", "POST", body, "case-key");
    assert.equal(first.status, 201);
    const created = (await first.json() as {data: MarketQuote}).data;
    assert.deepEqual([created.model, created.coreModel, created.productName, created.coreId], ["RTX4070TI", "RTX4070TI", "RTX4070TI", "GPU-NVIDIA-RTX4070TI"]);
    const before = structuredClone(fixture.state);
    for (const model of ["RTX4070TI", "RTX4070ti"]) {
      const replay = await fixture.request("/api/market-quotes", "POST", {...body, model, coreModel: model, coreId: created.coreId, quoteScope: "core", profile: coreQuoteProfile()}, "case-key");
      assert.equal(replay.status, 201);
      assert.equal((await replay.json() as {data: MarketQuote}).data.id, created.id);
      assert.deepEqual(fixture.state, before);
    }
    for (const changes of [{refSellPrice: 1}, {source: "另一来源"}, {validUntil: "2099-01-01"}]) assert.equal((await fixture.request("/api/market-quotes", "POST", {...body, ...changes}, "case-key")).status, 409);
    assert.equal((await fixture.request("/api/market-quotes", "POST", {...body, model: "4070ti"})).status, 400);
    assert.equal((await fixture.request("/api/market-quotes", "POST", {...body, productId: "FAKE"})).status, 400);
    assert.deepEqual(fixture.state, before);
  } finally {await fixture.close();}
});

test("HTTP source-free create/import works; omitted/blank source replays, history source survives edits", async () => {
  const fixture = await routeFixture(true);
  try {
    const {source: _source, ...command} = fixture.command;
    const first = await fixture.request("/api/market-quotes", "POST", command, "no-source-key");
    assert.equal(first.status, 201);
    const created = (await first.json() as {data: MarketQuote}).data;
    assert.equal(created.source, undefined);
    const before = structuredClone(fixture.state);
    for (const source of ["", " "]) {
      const replay = await fixture.request("/api/market-quotes", "POST", {...command, source}, "no-source-key");
      assert.equal(replay.status, 201);
      assert.equal((await replay.json() as {data: MarketQuote}).data.id, created.id);
      assert.deepEqual(fixture.state, before);
    }
    assert.equal((await fixture.request("/api/market-quotes/import", "POST", {quotes: [{...command, coreModel: "rtx4070ti", model: "rtx4070ti"}]})).status, 201);
    const path = `/api/market-quotes/${created.id}`;
    const prices = {todayBuyPrice: 1, todaySellPrice: 2};
    assert.equal((await fixture.request(path, "PATCH", {...prices, source: "历史来源"})).status, 200);
    const edited = await fixture.request(path, "PATCH", prices);
    assert.equal((await edited.json() as {data: MarketQuote}).data.source, "历史来源");
    assert.equal((await fixture.request(path, "PATCH", {...prices, source: ""})).status, 200);
    assert.equal(fixture.state.marketQuotes.find(quote => quote.id === created.id)?.source, undefined);
  } finally {await fixture.close();}
});

test("HTTP historical product is read-only until explicit empty-binding core conversion and replays safely", async () => {
  const fixture = await routeFixture(true);
  try {
    const base = createStoreActions(fixture.state).createMarketQuote({...fixture.command, quoteScope: "core", profile: coreQuoteProfile(), trend: "stable"});
    const old: MarketQuote = {...base, id: "OLD-PRODUCT", quoteScope: "product", productId: "REAL", profile: {...fixture.command.profile, condition: "used", warranty: "any", packaging: "any", currency: "CNY"},
      history: [{date: "old", buyPrice: 100, sellPrice: 200, quoteKey: `core|${base.coreId}|CNY`}]};
    fixture.state.marketQuotes = [old];
    const before = structuredClone(fixture.state);
    const path = `/api/market-quotes/${old.id}`;
    const prices = {todayBuyPrice: 110, todaySellPrice: 210};
    for (const body of [prices, {...prices, quoteScope: "product"}, {...prices, quoteScope: "core", profile: coreQuoteProfile()}, {...prices, quoteScope: "core", productId: "", profile: old.profile}]) {
      assert.equal((await fixture.request(path, "PATCH", body, "unconfirmed-product")).status, 400);
      assert.deepEqual(fixture.state, before);
      assert.equal(fixture.counters.claims, 0);
    }
    const command = {...prices, quoteScope: "core", profile: coreQuoteProfile(), productId: "", coreModel: "rtx5090"};
    fixture.restrict(false, false);
    assert.equal((await fixture.request(path, "PATCH", command, "product-convert")).status, 403);
    fixture.restrict(true, true);
    const converted = await fixture.request(path, "PATCH", command, "product-convert");
    assert.equal(converted.status, 200);
    const data = (await converted.json() as {data: MarketQuote}).data;
    assert.equal(data.quoteScope, "core");
    assert.equal(data.productId, "");
    assert.equal(data.changeRatio, undefined);
    assert.match(data.history?.[0].quoteKey || "", /^historical-product\|/);
    assert.equal(fixture.counters.notifications, 0);
    const facts = structuredClone(fixture.state);
    const replay = await fixture.request(path, "PATCH", {...command, coreModel: "RTX5090"}, "product-convert");
    assert.equal(replay.status, 200);
    assert.deepEqual(fixture.state, facts);
    assert.deepEqual({products: fixture.state.products, inventory: fixture.state.inventory}, {products: before.products, inventory: before.inventory});
    fixture.state.marketQuotes = [old, {...base, id: "EXISTING-BASE"}];
    const conflictFacts = structuredClone(fixture.state);
    assert.equal((await fixture.request(path, "PATCH", command, "product-convert-conflict")).status, 409);
    assert.deepEqual(fixture.state, conflictFacts);
  } finally {await fixture.close();}
});
