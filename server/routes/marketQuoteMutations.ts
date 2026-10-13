import type {Express, Request, RequestHandler} from "express";
import {z} from "zod";
import {saveStateRecords} from "../db.ts";
import {DEFAULT_TENANT_ID} from "../commercialConstants.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {assertMarketQuoteCategoryAssignable} from "../marketQuoteCategoryRepository.ts";
import {marketQuotePriceChange, marketQuotePriceChanges, snapshotMarketQuote} from "../marketQuoteNotifications.ts";
import {stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateMergePatch, type StateDeletePatch} from "../statePatch.ts";
import type {MarketQuote} from "../../src/types.ts";
import type {AppState, createStoreActions} from "../store.ts";
import {marketQuoteCreateDto, marketQuoteImportDto, marketQuoteUpdateDto, parseHttpDto} from "../httpDto.ts";
import {getPermissionsForUser, projectMarketQuoteForUser, publicStateMergeForUser} from "../publicState.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {ForbiddenError, ValidationError} from "../errors.ts";
import {coreQuoteProfile, gpuCoreIdentity, isCoreBaseQuote} from "../../src/utils/quoteReference.ts";
import type {StateCommandTransactionHook, StateCommandPatch} from "../stateCommand.ts";

type IdempotencyContext = {
  request: {tenantId: string; route: string; key: string; requestHash: string};
  replay?: {statusCode: number; response: unknown};
};

type MarketQuoteMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  deleteMerge: () => StateMergePatch;
  notifyPriceChanged: (change: Exclude<ReturnType<typeof marketQuotePriceChange>, null>) => void | Promise<unknown>;
  notifyPriceChanges: (changes: ReturnType<typeof marketQuotePriceChanges>) => void | Promise<unknown>;
  sendValidationError: (req: Request, res: Parameters<RequestHandler>[1], message: string) => void;
  saveRecords?: typeof saveStateRecords;
  claimMutationIdempotency?: (req: AuthenticatedRequest<SystemUserAccount>) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency?: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency?: <T>(context: IdempotencyContext | null, statusCode: number, hook?: StateCommandTransactionHook<T>) => StateCommandTransactionHook<T> | undefined;
};

/** Receipts store internal facts; acknowledgments and replays use current permissions. */
export function projectMarketQuoteMutationResponse(state: AppState, response: unknown, user?: SystemUserAccount) {
  if (!user) throw new ForbiddenError();
  if (!response || typeof response !== "object" || Array.isArray(response) || !("data" in response)) throw new Error("行情回执格式无效");
  const permissions = getPermissionsForUser(state, user);
  const projectQuote = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !("id" in value) || typeof value.id !== "string") throw new Error("行情回执记录无效");
    return projectMarketQuoteForUser(value as MarketQuote, permissions);
  };
  const rawData = response.data;
  let data: unknown;
  if (rawData === null) data = null;
  else if (rawData && typeof rawData === "object" && "quotes" in rawData && Array.isArray(rawData.quotes)) {
    const counts = Object.fromEntries(["created", "updated", "skipped"].map(key => {
      const value: unknown = Reflect.get(rawData, key);
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error("行情导入回执无效");
      return [key, value];
    }));
    data = {...counts, quotes: rawData.quotes.map(projectQuote)};
  } else data = projectQuote(rawData);
  const rawMerge = "stateMerge" in response && response.stateMerge && typeof response.stateMerge === "object" ? response.stateMerge : {};
  const patch: StateMergePatch = {};
  for (const key of ["marketQuotes", "logs"] as const) {
    const rows: unknown = Reflect.get(rawMerge, key);
    if (Array.isArray(rows)) patch[key] = rows;
  }
  const rawDelete = "stateDelete" in response && response.stateDelete && typeof response.stateDelete === "object" ? response.stateDelete : {};
  const ids: unknown = Reflect.get(rawDelete, "marketQuotes");
  const stateDelete: StateDeletePatch = Array.isArray(ids) ? {marketQuotes: ids.filter((id): id is string => typeof id === "string" && Boolean(id))} : {};
  return statePatchResponse(data, publicStateMergeForUser(state, patch, user), stateDelete);
}

function marketQuotesMerge(state: AppState, records: MarketQuote[], previousLogs: AppState["logs"]) {
  const previousIds = new Set(previousLogs.map(log => log.id));
  return {
    marketQuotes: records,
    logs: state.logs.filter(log => !previousIds.has(log.id)),
  } satisfies StateMergePatch;
}

function marketQuoteMerge(state: AppState, record: MarketQuote | null, previousLogs: AppState["logs"]) {
  return marketQuotesMerge(state, record ? [record] : [], previousLogs);
}

function captureMarketQuoteState(state: AppState) {
  return {marketQuotes: state.marketQuotes, inventory: state.inventory, products: state.products, logs: state.logs};
}

function restoreMarketQuoteState(state: AppState, previous: ReturnType<typeof captureMarketQuoteState>) {
  state.marketQuotes = previous.marketQuotes;
  state.inventory = previous.inventory;
  state.products = previous.products;
  state.logs = previous.logs;
}

/** Market quote writes stay isolated so notification side effects remain auditable. */
export function registerMarketQuoteMutationRoutes(app: Express, dependencies: MarketQuoteMutationDependencies) {
  const saveRecords = dependencies.saveRecords || saveStateRecords;
  const requirePricePermissions: RequestHandler = (req, _res, next) => {
    const user = (req as AuthenticatedRequest<SystemUserAccount>).authUser;
    if (!user) return next(new ForbiddenError());
    const permissions = getPermissionsForUser(dependencies.getState(), user);
    if (permissions.showCost !== true || permissions.showProfit !== true) return next(new ForbiddenError("维护行情需要完整成本与销售价格权限"));
    next();
  };
  const publicResponse = (req: Request, response: unknown) => projectMarketQuoteMutationResponse(dependencies.getState(), response, (req as AuthenticatedRequest<SystemUserAccount>).authUser);
  const persist = async <T>(req: Request, context: IdempotencyContext | null, status: number, data: T, patch: StateCommandPatch, categoryHook?: StateCommandTransactionHook<T>) => {
    const hook = dependencies.transactionHookWithIdempotency
      ? dependencies.transactionHookWithIdempotency(context, status, categoryHook) : categoryHook;
    const tenantId = (req as AuthenticatedRequest<unknown>).tenantId || DEFAULT_TENANT_ID;
    await saveRecords([...stateMergeRecords(patch.stateMerge), ...stateDeleteRecords(patch.stateDelete || {})], hook ? client => hook(client, data, patch) : undefined, tenantId);
  };
  // Core physical conditions are no longer part of command identity. Preserve
  // every other raw field so different prices/source/validity still conflict.
  const claim = (req: Request, scope?: string) => {
    const canonicalQuote = (body: unknown, quoteScope?: string) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) return body;
      const actualScope = Reflect.get(body, "quoteScope") || quoteScope || (req.method === "POST" ? "core" : undefined);
      if (actualScope !== "core") return body;
      const result = {...body};
      Reflect.deleteProperty(result, "profile");
      const source = Reflect.get(body, "source");
      if (typeof source === "string") {
        if (req.method === "POST" && !source.trim()) Reflect.deleteProperty(result, "source");
        else Reflect.set(result, "source", source.trim());
      }
      if (req.method === "POST" || Object.hasOwn(body, "quoteScope")) Reflect.set(result, "quoteScope", "core");
      const model = Reflect.get(body, "coreModel") ?? Reflect.get(body, "model");
      const core = typeof model === "string" ? gpuCoreIdentity(model) : null;
      if (core) {
        Reflect.set(result, "coreModel", core.coreModel);
        Reflect.set(result, "coreId", Reflect.get(body, "coreId") ?? core.coreId);
        if (Object.hasOwn(body, "model")) Reflect.set(result, "model", core.coreModel);
      }
      return result;
    };
    const body = req.body && typeof req.body === "object" && Array.isArray(req.body.quotes)
      ? {...req.body, quotes: req.body.quotes.map((quote: unknown) => canonicalQuote(quote))}
      : canonicalQuote(req.body, scope);
    const stableFields = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stableFields);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableFields(Reflect.get(value, key))]));
    };
    const requestForClaim = Object.create(req) as AuthenticatedRequest<SystemUserAccount>;
    Object.defineProperty(requestForClaim, "body", {value: stableFields(body)});
    return dependencies.claimMutationIdempotency?.(requestForClaim) ?? Promise.resolve(null);
  };
  const release = async (context: IdempotencyContext | null) => {await dependencies.releaseMutationIdempotency?.(context);};
  app.post(
    "/api/market-quotes",
    dependencies.requireMenu("quotes"),
    requirePricePermissions,
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(marketQuoteCreateDto, req.body);
      const idempotency = await claim(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(publicResponse(req, idempotency.replay.response));
        return;
      }
      const state = dependencies.getState();
      const previous = captureMarketQuoteState(state);
      const tenantId = (req as AuthenticatedRequest<unknown>).tenantId || DEFAULT_TENANT_ID;
      let created: MarketQuote;
      let stateMerge: StateMergePatch;
      try {
        created = dependencies.actions(req).createMarketQuote(command);
        stateMerge = marketQuoteMerge(state, created, previous.logs);
        await persist(req, idempotency, 201, created, {stateMerge}, async (client) => {
          await assertMarketQuoteCategoryAssignable(client, tenantId, created.categoryId);
        });
      } catch (error) {
        restoreMarketQuoteState(state, previous);
        await release(idempotency);
        throw error;
      }
      res.status(201).json(publicResponse(req, statePatchResponse(created, stateMerge)));
    }),
  );

  app.post(
    "/api/market-quotes/import",
    dependencies.requireMenu("quotes"),
    requirePricePermissions,
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(marketQuoteImportDto, req.body);
      const idempotency = await claim(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(publicResponse(req, idempotency.replay.response));
        return;
      }
      const state = dependencies.getState();
      const previous = captureMarketQuoteState(state);
      const tenantId = (req as AuthenticatedRequest<unknown>).tenantId || DEFAULT_TENANT_ID;
      const quotes = command.quotes;
      const beforeQuotes = new Map(state.marketQuotes.map((quote) => [quote.id, {...snapshotMarketQuote(quote), categoryId: quote.categoryId}] as const));
      let result: ReturnType<ReturnType<typeof dependencies.actions>["importMarketQuotes"]>;
      let stateMerge: StateMergePatch;
      try {
        result = dependencies.actions(req).importMarketQuotes(quotes);
        stateMerge = marketQuotesMerge(state, result.quotes, previous.logs);
        await persist(req, idempotency, 201, result, {stateMerge}, async (client) => {
          for (const quote of result.quotes) {
            await assertMarketQuoteCategoryAssignable(client, tenantId, quote.categoryId, beforeQuotes.get(quote.id)?.categoryId);
          }
        });
      } catch (error) {
        restoreMarketQuoteState(state, previous);
        await release(idempotency);
        throw error;
      }
      void dependencies.notifyPriceChanges(marketQuotePriceChanges(beforeQuotes, result.quotes));
      res.status(201).json(publicResponse(req, statePatchResponse(result, stateMerge)));
    }),
  );

  app.patch(
    "/api/market-quotes/:id",
    dependencies.requireMenu("quotes"),
    requirePricePermissions,
    dependencies.asyncRoute(async (req, res) => {
      const current = dependencies.getState().marketQuotes.find(quote => quote.id === req.params.id);
      const currentScope = current?.quoteScope;
      if (current && !isCoreBaseQuote(current) && !isCoreBaseQuote(req.body || {})) throw new ValidationError("请明确确认转换为核心基础价");
      if (current && !isCoreBaseQuote(current) && current.productId && req.body?.productId !== "") throw new ValidationError("转换核心基础价必须明确清空商品关联");
      const command = parseHttpDto(marketQuoteUpdateDto, currentScope === "core" ? {...req.body, profile: coreQuoteProfile()} : req.body);
      const idempotency = await claim(req, currentScope);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(publicResponse(req, idempotency.replay.response));
        return;
      }
      const state = dependencies.getState();
      const previous = captureMarketQuoteState(state);
      const tenantId = (req as AuthenticatedRequest<unknown>).tenantId || DEFAULT_TENANT_ID;
      const existing = state.marketQuotes.find((quote) => quote.id === req.params.id!);
      const beforeQuote = existing ? snapshotMarketQuote(existing) : undefined;
      let updated: MarketQuote | null;
      let stateMerge: StateMergePatch;
      try {
        updated = dependencies.actions(req).updateMarketPrice(req.params.id!, command.todayBuyPrice, command.todaySellPrice, command.remarks, command.categoryId, command);
        stateMerge = marketQuoteMerge(state, updated, previous.logs);
        await persist(req, idempotency, updated ? 200 : 404, updated, {stateMerge}, async (client) => {
          if (updated) await assertMarketQuoteCategoryAssignable(client, tenantId, updated.categoryId, existing?.categoryId);
        });
      } catch (error) {
        restoreMarketQuoteState(state, previous);
        await release(idempotency);
        throw error;
      }
      const priceChange = marketQuotePriceChange(beforeQuote, updated || undefined);
      if (priceChange) void dependencies.notifyPriceChanged(priceChange);
      res.status(updated ? 200 : 404).json(publicResponse(req, statePatchResponse(updated, stateMerge)));
    }),
  );

  app.delete(
    "/api/market-quotes/:id",
    dependencies.requireMenu("quotes"),
    requirePricePermissions,
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      parseHttpDto(z.object({}).strict(), req.body ?? {});
      const idempotency = await claim(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(publicResponse(req, idempotency.replay.response));
        return;
      }
      const state = dependencies.getState();
      const previous = captureMarketQuoteState(state);
      let deleted: MarketQuote | null;
      let stateMerge: StateMergePatch;
      let stateDelete: {marketQuotes: string[]};
      try {
        deleted = dependencies.actions(req).deleteMarketQuote(req.params.id!);
        stateMerge = marketQuotesMerge(state, [], previous.logs);
        stateDelete = {marketQuotes: deleted?.id ? [deleted.id] : []};
        await persist(req, idempotency, deleted ? 200 : 404, deleted, {stateMerge, stateDelete});
      } catch (error) {
        restoreMarketQuoteState(state, previous);
        await release(idempotency);
        throw error;
      }
      res.status(deleted ? 200 : 404).json(publicResponse(req, statePatchResponse(deleted, stateMerge, stateDelete)));
    }),
  );
}
