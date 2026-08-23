import type { Express, Request, RequestHandler } from "express";
import type { StateCollectionKey } from "../db.ts";

type SnapshotDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  publicStatePatch: (req: Request, keys: StateCollectionKey[]) => Record<string, unknown>;
};

type SnapshotRoute = {
  path: string;
  menus: string[];
  keys: StateCollectionKey[];
};

const routes: SnapshotRoute[] = [
  { path: "/api/customers", menus: ["customers"], keys: ["customers"] },
  { path: "/api/vendors", menus: ["vendors"], keys: ["vendors"] },
  {
    path: "/api/finance/dashboard",
    menus: ["finance"],
    keys: ["settlementAccounts", "settlementLedger", "financeLedger", "salesInvoices", "purchaseInvoices", "returnOrders", "inventory"],
  },
  { path: "/api/gpu_erp/finance/account-transfers", menus: ["account_transfer"], keys: ["accountTransfers"] },
  { path: "/api/gpu_erp/finance/payment-ins", menus: ["payment_in"], keys: ["paymentInRecords"] },
  { path: "/api/gpu_erp/finance/payment-outs", menus: ["payment_out"], keys: ["paymentOutRecords"] },
  { path: "/api/finance/commissions", menus: ["purchase_commission", "sales_commission"], keys: ["purchaseCommissions"] },
  { path: "/api/purchase-invoices", menus: ["purchase_list"], keys: ["purchaseInvoices", "inventory"] },
  {
    path: "/api/purchase-invoices/reference",
    menus: ["purchase_add"],
    keys: ["products", "purchaseInvoices", "customers", "vendors", "settlementAccounts", "inventory"],
  },
  {
    path: "/api/purchase-invoices/detail",
    menus: ["purchase_list"],
    keys: ["purchaseInvoices", "inventory", "inspections", "paymentOutRecords", "returnOrders"],
  },
  { path: "/api/sales-invoices", menus: ["sales_list"], keys: ["salesInvoices", "inventory"] },
  { path: "/api/sales-invoices/outbound", menus: ["sales_outbound"], keys: ["salesInvoices", "inventory", "products"] },
  { path: "/api/inspections/workspace", menus: ["inspections"], keys: ["inventory", "inspections"] },
  { path: "/api/aftersales/workspace", menus: ["aftersales"], keys: ["aftersales", "inventory", "salesInvoices"] },
  {
    path: "/api/returns/reference",
    menus: ["return_sales", "return_purchase", "return_orders"],
    keys: ["products", "purchaseInvoices", "salesInvoices", "inventory", "paymentOutRecords", "settlementAccounts"],
  },
];

/**
 * Feature-scoped read models used while retiring the historical full-state response.
 * Every route has its own permission boundary and returns only the collections needed
 * by that screen, while existing adapters keep the browser-facing domain contract stable.
 */
export function registerDomainSnapshotRoutes(app: Express, dependencies: SnapshotDependencies) {
  for (const route of routes) {
    const permission = route.menus.length === 1
      ? dependencies.requireMenu(route.menus[0]!)
      : dependencies.requireAnyMenu(route.menus);
    app.get(route.path, permission, (req, res) => {
      res.json({ data: dependencies.publicStatePatch(req, route.keys) });
    });
  }
}

export const domainSnapshotRouteContracts = routes.map(({ path, menus, keys }) => ({
  path,
  menus: [...menus],
  keys: [...keys],
}));
