import type {Express, RequestHandler} from "express";
import {saveStateRecords} from "../db.ts";
import {stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {Request as ExpressRequest} from "express";

type AftersalesMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: ExpressRequest) => ReturnType<typeof createStoreActions>;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function aftersalesMerge(state: AppState, record: {id: string; sn: string; customerId?: string; salesInvoiceNo?: string} | null) {
  if (!record) return {logs: state.logs.slice(0, 1)};
  return {
    aftersales: state.aftersales.filter((item) => item.id === record.id),
    inventory: state.inventory.filter((item) => item.sn === record.sn),
    salesInvoices: state.salesInvoices.filter((item) => item.id === record.salesInvoiceNo || item.invoiceNo === record.salesInvoiceNo),
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  } satisfies StateMergePatch;
}

/** Warranty/aftersales writes are intentionally small and isolated from invoice routes. */
export function registerAftersalesMutationRoutes(app: Express, dependencies: AftersalesMutationDependencies) {
  app.post(
    "/api/aftersales",
    dependencies.requireMenu("aftersales"),
    dependencies.asyncRoute(async (req, res) => {
      const created = dependencies.actions(req).addAftersalesClaim(req.body);
      const stateMerge = aftersalesMerge(dependencies.getState(), created);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.patch(
    "/api/aftersales/:id",
    dependencies.requireMenu("aftersales"),
    dependencies.asyncRoute(async (req, res) => {
      const updated = dependencies.actions(req).updateAftersalesStatus(req.params.id!, req.body);
      const stateMerge = aftersalesMerge(dependencies.getState(), updated);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
    }),
  );
}
