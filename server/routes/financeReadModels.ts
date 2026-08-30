import type { Express, Request, RequestHandler } from "express";
import type { StateCollectionKey } from "../db.ts";
import type { AppState } from "../store.ts";
import type { buildCustomerFundsSnapshot } from "../customerFunds.ts";

type FinanceRequest = Request & { authUser?: unknown };

type FinanceReadModelDependencies = {
  state: AppState;
  requireMenu: (menuId: string) => RequestHandler;
  publicStatePatch: (req: FinanceRequest, keys: StateCollectionKey[]) => Record<string, unknown>;
  buildCustomerFundsSnapshot: typeof buildCustomerFundsSnapshot;
  getStoreDate: () => string;
  startOfMonth: (date: string) => string;
  addDateDays: (date: string, days: number) => string;
  ok: (data?: unknown) => unknown;
  sendValidationError: (req: FinanceRequest, res: Parameters<RequestHandler>[1], message: string) => void;
};

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateRangeDays(startDate: string, endDate: string) {
  return Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
}

/** Finance read models are kept out of the composition root and expose only scoped projections. */
export function registerFinanceReadModelRoutes(app: Express, dependencies: FinanceReadModelDependencies) {
  app.get("/api/settlement-ledger", dependencies.requireMenu("settlement_ledger"), (req: FinanceRequest, res) => {
    res.json(dependencies.ok({
      settlementLedger: dependencies.publicStatePatch(req, ["settlementLedger"]).settlementLedger ?? [],
      settlementLedgerLoaded: true,
    }));
  });

  app.get("/api/gpu_erp/finance/customer-funds", dependencies.requireMenu("customer_funds"), (req: FinanceRequest, res) => {
    const today = dependencies.getStoreDate();
    const startDate = String(req.query.startDate || dependencies.startOfMonth(today));
    const endDate = String(req.query.endDate || today);
    const trendStartDate = String(req.query.trendStartDate || dependencies.addDateDays(today, -6));
    const trendEndDate = String(req.query.trendEndDate || today);
    const dates = [startDate, endDate, trendStartDate, trendEndDate];
    if (dates.some((date) => !validDateKey(date)) || startDate > endDate || trendStartDate > trendEndDate) {
      dependencies.sendValidationError(req, res, "资金往来日期范围无效");
      return;
    }
    if (dateRangeDays(startDate, endDate) > 366 || dateRangeDays(trendStartDate, trendEndDate) > 366) {
      dependencies.sendValidationError(req, res, "资金往来查询范围不能超过 366 天");
      return;
    }
    res.json(dependencies.ok(dependencies.buildCustomerFundsSnapshot(dependencies.state, { today, startDate, endDate, trendStartDate, trendEndDate })));
  });

  app.get("/api/finance-ledger", dependencies.requireMenu("finance"), (req: FinanceRequest, res) => {
    res.json(dependencies.ok({
      financeLedger: dependencies.publicStatePatch(req, ["financeLedger"]).financeLedger ?? [],
      financeLedgerLoaded: true,
    }));
  });
}
