import type {Express, Request, RequestHandler} from "express";
import {
  queryPaymentInPage,
  queryPaymentOutPage,
  queryPurchaseInvoicePage,
  querySalesInvoicePage,
  querySettlementLedgerPage,
} from "../db.ts";
import {AppError} from "../errors.ts";
import type {PurchaseInvoice, SalesInvoice} from "../../src/types.ts";

type VisibilityPermissions = {showCost?: boolean; showProfit?: boolean};

type PagedRecordDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => VisibilityPermissions;
};

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertDateRange(dateStart: string, dateEnd: string, label: string) {
  if ((dateStart && !validDateKey(dateStart)) || (dateEnd && !validDateKey(dateEnd)) || (dateStart && dateEnd && dateStart > dateEnd)) {
    throw new AppError(`${label}日期范围无效`, 400, "VALIDATION_ERROR");
  }
}

function invoicePageFilters(req: Request) {
  return {
    page: Number(req.query.page), pageSize: Number(req.query.pageSize), keyword: String(req.query.keyword || "").trim(),
    sourceType: String(req.query.sourceType || ""), channel: String(req.query.channel || ""), paymentStatus: String(req.query.paymentStatus || ""),
    outboundStatus: String(req.query.outboundStatus || ""), dateStart: String(req.query.dateStart || ""), dateEnd: String(req.query.dateEnd || ""),
    sortKey: String(req.query.sortKey || "date"), sortDirection: req.query.sortDirection === "asc" ? "asc" as const : "desc" as const,
  };
}

function paymentPageFilters(req: Request) {
  return {
    page: Number(req.query.page), pageSize: Number(req.query.pageSize), keyword: String(req.query.keyword || "").trim(),
    accountId: String(req.query.accountId || ""), handler: String(req.query.handler || ""), businessType: String(req.query.businessType || ""),
    dateStart: String(req.query.startDate || req.query.dateStart || ""), dateEnd: String(req.query.endDate || req.query.dateEnd || ""),
  };
}

/** PostgreSQL-backed read models for high-growth financial and invoice collections. */
export function registerPagedRecordRoutes(app: Express, dependencies: PagedRecordDependencies) {
  app.get("/api/purchase-invoices", dependencies.requireMenu("purchase_list"), async (req, res, next) => {
    try {
      const filters = invoicePageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "单据");
      const page = await queryPurchaseInvoicePage<PurchaseInvoice & {__inventoryCount?: number}>(filters);
      const permissions = dependencies.permissionsForRequest(req);
      const data = page.data.map((invoice) => ({...invoice,
        ...(!permissions.showCost ? {totalCost: 0, items: invoice.items.map((item) => ({...item, buyPrice: 0}))} : {}),
        ...(!(permissions.showCost && permissions.showProfit) ? {estTotalProfit: 0} : {}),
        ...(!permissions.showProfit ? {estTotalSell: 0} : {}),
      }));
      const summary = {...page.meta.summary};
      if (!permissions.showCost) delete summary.totalCost;
      if (!(permissions.showCost && permissions.showProfit)) delete summary.estimatedProfit;
      res.json({data: {purchaseInvoices: data, inventory: []}, meta: {...page.meta, summary}});
    } catch (error) { next(error); }
  });

  app.get("/api/sales-invoices", dependencies.requireAnyMenu(["sales_list", "finance_reports"]), async (req, res, next) => {
    try {
      const filters = invoicePageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "单据");
      const page = await querySalesInvoicePage<SalesInvoice & {__linkedInventoryCount?: number}>(filters);
      const permissions = dependencies.permissionsForRequest(req);
      const data = page.data.map((invoice) => ({...invoice,
        ...(!permissions.showCost ? {totalCost: 0, items: invoice.items.map((item) => ({...item, costPrice: 0}))} : {}),
        ...(!(permissions.showCost && permissions.showProfit) ? {totalProfit: 0, items: invoice.items.map((item) => ({...item, profit: 0, ...(!permissions.showCost ? {costPrice: 0} : {})}))} : {}),
      }));
      const summary = {...page.meta.summary};
      if (!(permissions.showCost && permissions.showProfit)) delete summary.totalProfit;
      res.json({data: {salesInvoices: data, inventory: []}, meta: {...page.meta, summary}});
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/settlement-ledger", dependencies.requireMenu("settlement_ledger"), async (req, res, next) => {
    try {
      const dateStart = String(req.query.dateStart || "");
      const dateEnd = String(req.query.dateEnd || "");
      assertDateRange(dateStart, dateEnd, "账户流水");
      res.json(await querySettlementLedgerPage({
        page: Number(req.query.page), pageSize: Number(req.query.pageSize), keyword: String(req.query.keyword || "").trim().toLocaleLowerCase(),
        accountId: String(req.query.accountId || ""), handler: String(req.query.handler || ""), businessType: String(req.query.businessType || ""),
        direction: String(req.query.direction || ""), relatedDocNo: String(req.query.relatedDocNo || ""), customerName: String(req.query.customerName || ""),
        supplierName: String(req.query.supplierName || ""), dateStart, dateEnd,
      }));
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/payment-ins", dependencies.requireMenu("payment_in"), async (req, res, next) => {
    try {
      const filters = paymentPageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "收入");
      res.json(await queryPaymentInPage(filters));
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/payment-outs", dependencies.requireMenu("payment_out"), async (req, res, next) => {
    try {
      const filters = paymentPageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "支出");
      res.json(await queryPaymentOutPage(filters));
    } catch (error) { next(error); }
  });
}
