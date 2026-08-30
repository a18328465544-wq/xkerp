import type { Express, Request, RequestHandler } from "express";
import {getFinanceDashboard, listAccountTransfers} from "../financeDashboardRepository.ts";
import {getCustomerFundsSnapshot} from "../customerFundsRepository.ts";

type FinanceRequest = Request & { authUser?: unknown; tenantId?: string; storeId?: string };

type FinanceReadModelDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getStoreDate: () => string;
  startOfMonth: (date: string) => string;
  addDateDays: (date: string, days: number) => string;
  ok: (data?: unknown) => unknown;
  sendValidationError: (req: FinanceRequest, res: Parameters<RequestHandler>[1], message: string) => void;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
};

function hasMenu(permissions: {allowedMenus: string[]}, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

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
  app.get("/api/finance/dashboard", dependencies.requireMenu("finance"), async (req: FinanceRequest, res, next) => {
    try {
      const today = dependencies.getStoreDate();
      const startDate = String(req.query.startDate || dependencies.addDateDays(today, -6));
      const endDate = String(req.query.endDate || today);
      if (![startDate, endDate].every(validDateKey) || startDate > endDate || dateRangeDays(startDate, endDate) > 366) {
        dependencies.sendValidationError(req, res, "财务总览日期范围无效或超过 366 天");
        return;
      }
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await getFinanceDashboard({tenantId: req.tenantId, storeId: req.storeId}, {startDate, endDate}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true, canViewAccounts: hasMenu(permissions, "settlement_accounts"), canViewSettlementLedger: hasMenu(permissions, "settlement_ledger"), canViewReturns: hasMenu(permissions, "return_orders") || hasMenu(permissions, "return_sales") || hasMenu(permissions, "return_purchase")}));
    } catch (error) {next(error);}
  });

  app.get("/api/gpu_erp/finance/account-transfers", dependencies.requireMenu("account_transfer"), async (req: FinanceRequest, res, next) => {
    try {
      res.json(await listAccountTransfers({tenantId: req.tenantId, storeId: req.storeId}, {page: Number(req.query.page || 1), pageSize: Number(req.query.pageSize || 20), keyword: String(req.query.keyword || ""), accountId: String(req.query.accountId || "all"), handler: String(req.query.handler || ""), startDate: String(req.query.startDate || ""), endDate: String(req.query.endDate || "")}));
    } catch (error) {next(error);}
  });

  app.get("/api/gpu_erp/finance/customer-funds", dependencies.requireMenu("customer_funds"), async (req: FinanceRequest, res, next) => {
    try {
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
      const snapshot = await getCustomerFundsSnapshot(
        {tenantId: req.tenantId, storeId: req.storeId},
        {today, startDate, endDate, trendStartDate, trendEndDate},
      );
      res.json(dependencies.ok(snapshot));
    } catch (error) {
      next(error);
    }
  });
}
