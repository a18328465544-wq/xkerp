import type { Express, Request, RequestHandler, Response } from "express";
import { getDailyClosing, listDailyClosings, loadState, saveDailyClosing } from "../db.ts";
import { buildDailyBusinessReport } from "../dailyReport.ts";
import { storeDate, storeDateTime } from "../../src/utils/storeTime.ts";
import type { DailyClosing, SystemUserAccount } from "../../src/types.ts";
import { financeDailyClosingCreateDto, financeDailyClosingQueryDto, parseHttpDto } from "../httpDto.ts";

type FinanceRequest = Request & { authUser?: SystemUserAccount; tenantId?: string; storeId?: string };

type FinanceClosingDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  sendValidationError: (req: Request, res: Response, message: string) => void;
};

/** Daily closing owns its persisted snapshot and never returns the global ERP state. */
export function registerFinanceClosingRoutes(app: Express, dependencies: FinanceClosingDependencies) {
  const financeMenu = dependencies.requireMenu("finance");

  app.get("/api/finance/daily-closing", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeDailyClosingQueryDto, req.query);
    const date = query.date || storeDate();
    res.json({ data: await getDailyClosing(date, req.tenantId, req.storeId) });
  }));

  app.get("/api/finance/daily-closings", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeDailyClosingQueryDto, req.query);
    res.json({ data: await listDailyClosings(query.limit, req.tenantId, req.storeId) });
  }));

  app.post("/api/finance/daily-closing", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const command = parseHttpDto(financeDailyClosingCreateDto, req.body);
    const date = command.date || storeDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dependencies.sendValidationError(req, res, "日结日期必须是 YYYY-MM-DD");
      return;
    }
    const current = await loadState(req.tenantId, req.storeId);
    const report = buildDailyBusinessReport(current, date, "23:59");
    const closing: DailyClosing = {
      id: `RJ-${date.replace(/-/g, "")}`,
      date,
      closedAt: storeDateTime(),
      closedBy: req.authUser?.displayName || req.authUser?.username || "系统",
      remarks: command.remarks || undefined,
      snapshot: {
        income: report.cashIncome,
        expense: report.cashExpense,
        netCash: report.netCashChange,
        salesCount: report.salesOrderCount,
        purchaseCount: report.personalRecycleCount + report.peerPurchaseCount,
        receivable: report.receivable,
        payable: report.payable,
        unreviewed: current.financeLedger.filter((item) => item.status === "待审核").length,
        accountReconciliationDifferences: report.accountReconciliationDifferences,
      },
    };
    res.status(201).json({ data: await saveDailyClosing(closing, req.tenantId, req.storeId) });
  }));
}
