import type {Express, Request, RequestHandler} from "express";
import {saveStateRecords} from "../db.ts";
import {compactStateMerge, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";

type FinanceLedgerDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

/** Reconciliation is kept as a small write boundary instead of another root-level route. */
export function registerFinanceLedgerMutationRoutes(app: Express, dependencies: FinanceLedgerDependencies) {
  app.patch(
    "/api/finance-ledger/:id/reconcile",
    dependencies.requireMenu("finance"),
    dependencies.asyncRoute(async (req, res) => {
      const updated = dependencies.actions(req).reconcileLedgerItem(req.params.id!);
      const stateMerge = compactStateMerge({
        financeLedger: updated ? [updated] : [],
        logs: dependencies.getState().logs.slice(0, 1),
      });
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
    }),
  );
}
