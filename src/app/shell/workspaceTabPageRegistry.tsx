import {lazy, type ReactNode} from "react";

const DashboardPage = lazy(() => import("@/src/features/dashboard/pages/DashboardPage").then((module) => ({default: module.DashboardPage})));
const InventoryListPage = lazy(() => import("@/src/features/inventory/pages/InventoryListPage").then((module) => ({default: module.InventoryListPage})));
const SalesListPage = lazy(() => import("@/src/features/sales/pages/SalesListPage").then((module) => ({default: module.SalesListPage})));
const NewSalesOrderPage = lazy(() => import("@/src/features/sales/pages/NewSalesOrderPage").then((module) => ({default: module.NewSalesOrderPage})));
const SalesOutboundPage = lazy(() => import("@/src/features/sales/pages/SalesOutboundPage").then((module) => ({default: module.SalesOutboundPage})));
const AiInsightsPage = lazy(() => import("@/src/features/ai/pages/AiInsightsPage").then((module) => ({default: module.AiInsightsPage})));
const MarketQuotesPage = lazy(() => import("@/src/features/quotes/pages/MarketQuotesPage").then((module) => ({default: module.MarketQuotesPage})));
const ProductLibraryPage = lazy(() => import("@/src/features/products/pages/ProductLibraryPage").then((module) => ({default: module.ProductLibraryPage})));
const AssemblyWorkspacePage = lazy(() => import("@/src/features/assembly/pages/AssemblyWorkspacePage").then((module) => ({default: module.AssemblyWorkspacePage})));
const PurchaseListPage = lazy(() => import("@/src/features/purchase/pages/PurchaseListPage").then((module) => ({default: module.PurchaseListPage})));
const NewPurchaseOrderPage = lazy(() => import("@/src/features/purchase/pages/NewPurchaseOrderPage").then((module) => ({default: module.NewPurchaseOrderPage})));
const PurchaseDetailPage = lazy(() => import("@/src/features/purchase/pages/PurchaseDetailPage").then((module) => ({default: module.PurchaseDetailPage})));
const PurchaseEditPage = lazy(() => import("@/src/features/purchase/pages/PurchaseEditPage").then((module) => ({default: module.PurchaseEditPage})));
const InspectionWorkspacePage = lazy(() => import("@/src/features/inspections/pages/InspectionWorkspacePage").then((module) => ({default: module.InspectionWorkspacePage})));
const PurchaseReturnListPage = lazy(() => import("@/src/features/returns/pages/PurchaseReturnListPage").then((module) => ({default: module.PurchaseReturnListPage})));
const NewPurchaseReturnPage = lazy(() => import("@/src/features/returns/pages/NewPurchaseReturnPage").then((module) => ({default: module.NewPurchaseReturnPage})));
const SalesReturnListPage = lazy(() => import("@/src/features/returns/pages/SalesReturnListPage").then((module) => ({default: module.SalesReturnListPage})));
const NewSalesReturnPage = lazy(() => import("@/src/features/returns/pages/NewSalesReturnPage").then((module) => ({default: module.NewSalesReturnPage})));
const CrmWorkspacePage = lazy(() => import("@/src/features/crm/pages/CrmWorkspacePage").then((module) => ({default: module.CrmWorkspacePage})));
const NewCustomerLeadPage = lazy(() => import("@/src/features/crm/pages/NewCustomerLeadPage").then((module) => ({default: module.NewCustomerLeadPage})));
const CustomerDirectoryPage = lazy(() => import("@/src/features/customers/pages/CustomerDirectoryPage").then((module) => ({default: module.CustomerDirectoryPage})));
const VendorDirectoryPage = lazy(() => import("@/src/features/vendors/pages/VendorDirectoryPage").then((module) => ({default: module.VendorDirectoryPage})));
const AftersalesWorkspacePage = lazy(() => import("@/src/features/aftersales/pages/AftersalesWorkspacePage").then((module) => ({default: module.AftersalesWorkspacePage})));
const FinanceDashboardPage = lazy(() => import("@/src/features/finance/pages/FinanceDashboardPage").then((module) => ({default: module.FinanceDashboardPage})));
const FinanceAccountsPage = lazy(() => import("@/src/features/finance/pages/FinanceAccountsPage").then((module) => ({default: module.FinanceAccountsPage})));
const FinanceLedgerPage = lazy(() => import("@/src/features/finance/pages/FinanceLedgerPage").then((module) => ({default: module.FinanceLedgerPage})));
const FinanceIncomePage = lazy(() => import("@/src/features/finance/pages/FinanceIncomePage").then((module) => ({default: module.FinanceIncomePage})));
const FinanceExpensePage = lazy(() => import("@/src/features/finance/pages/FinanceExpensePage").then((module) => ({default: module.FinanceExpensePage})));
const FinanceTransfersPage = lazy(() => import("@/src/features/finance/pages/FinanceTransfersPage").then((module) => ({default: module.FinanceTransfersPage})));
const FinanceProfitPage = lazy(() => import("@/src/features/finance/pages/FinanceProfitPage").then((module) => ({default: module.FinanceProfitPage})));
const FinanceClosingPage = lazy(() => import("@/src/features/finance/pages/FinanceClosingPage").then((module) => ({default: module.FinanceClosingPage})));
const FinanceReturnReconcilePage = lazy(() => import("@/src/features/finance/pages/FinanceReturnReconcilePage").then((module) => ({default: module.FinanceReturnReconcilePage})));
const FinanceCommissionPage = lazy(() => import("@/src/features/finance/pages/FinanceCommissionPage").then((module) => ({default: module.FinanceCommissionPage})));
const FinanceCustomerFundsPage = lazy(() => import("@/src/features/finance/pages/FinanceCustomerFundsPage").then((module) => ({default: module.FinanceCustomerFundsPage})));
const SettingsUsersPage = lazy(() => import("@/src/features/settings/pages/SettingsUsersPage").then((module) => ({default: module.SettingsUsersPage})));
const SettingsLogsPage = lazy(() => import("@/src/features/settings/pages/SettingsLogsPage").then((module) => ({default: module.SettingsLogsPage})));
const BackupPage = lazy(() => import("@/src/features/settings/pages/BackupPage").then((module) => ({default: module.BackupPage})));
const DesignSystemPage = lazy(() => import("@/src/features/design-system/pages/DesignSystemPage").then((module) => ({default: module.DesignSystemPage})));

export type WorkspaceTabPageDescriptor = {
  pageKey: string;
  render: () => ReactNode;
};

const staticPage = (pageKey: string, render: () => ReactNode): WorkspaceTabPageDescriptor => ({pageKey, render});

const staticPages: Record<string, WorkspaceTabPageDescriptor> = {
  "/": staticPage("dashboard", () => <DashboardPage />),
  "/inventory": staticPage("inventory", () => <InventoryListPage />),
  "/sales": staticPage("sales-list", () => <SalesListPage />),
  "/sales/new": staticPage("sales-create", () => <NewSalesOrderPage />),
  "/sales/outbound": staticPage("sales-outbound", () => <SalesOutboundPage />),
  "/sales/returns": staticPage("sales-returns", () => <SalesReturnListPage />),
  "/sales/returns/new": staticPage("sales-return-create", () => <NewSalesReturnPage />),
  "/ai-insights": staticPage("ai-insights", () => <AiInsightsPage />),
  "/quotes": staticPage("quotes", () => <MarketQuotesPage />),
  "/products": staticPage("products", () => <ProductLibraryPage />),
  "/assembly": staticPage("assembly", () => <AssemblyWorkspacePage />),
  "/purchase": staticPage("purchase-list", () => <PurchaseListPage />),
  "/purchase/new": staticPage("purchase-create", () => <NewPurchaseOrderPage />),
  "/inspections": staticPage("inspections", () => <InspectionWorkspacePage />),
  "/purchase/returns": staticPage("purchase-returns", () => <PurchaseReturnListPage />),
  "/purchase/returns/new": staticPage("purchase-return-create", () => <NewPurchaseReturnPage />),
  "/crm": staticPage("crm", () => <CrmWorkspacePage />),
  "/crm/customers": staticPage("customers", () => <CustomerDirectoryPage />),
  "/crm/customers/new": staticPage("customer-create", () => <NewCustomerLeadPage />),
  "/crm/vendors": staticPage("vendors", () => <VendorDirectoryPage />),
  "/aftersales": staticPage("aftersales", () => <AftersalesWorkspacePage />),
  "/finance": staticPage("finance", () => <FinanceDashboardPage />),
  "/finance/accounts": staticPage("finance-accounts", () => <FinanceAccountsPage />),
  "/finance/ledger": staticPage("finance-ledger", () => <FinanceLedgerPage />),
  "/finance/income": staticPage("finance-income", () => <FinanceIncomePage />),
  "/finance/expense": staticPage("finance-expense", () => <FinanceExpensePage />),
  "/finance/transfers": staticPage("finance-transfers", () => <FinanceTransfersPage />),
  "/finance/profit": staticPage("finance-profit", () => <FinanceProfitPage />),
  "/finance/closing": staticPage("finance-closing", () => <FinanceClosingPage />),
  "/finance/return-reconcile": staticPage("finance-return-reconcile", () => <FinanceReturnReconcilePage />),
  "/finance/purchase-commission": staticPage("finance-purchase-commission", () => <FinanceCommissionPage mode="purchase" />),
  "/finance/sales-commission": staticPage("finance-sales-commission", () => <FinanceCommissionPage mode="sales" />),
  "/finance/customer-funds": staticPage("finance-customer-funds", () => <FinanceCustomerFundsPage />),
  "/settings": staticPage("settings-users", () => <SettingsUsersPage />),
  "/settings/users": staticPage("settings-users", () => <SettingsUsersPage />),
  "/settings/logs": staticPage("settings-logs", () => <SettingsLogsPage />),
  "/settings/backup": staticPage("settings-backup", () => <BackupPage />),
  "/__design-system": staticPage("design-system", () => <DesignSystemPage />),
};

function decodePathPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveWorkspaceTabPage(pathname: string): WorkspaceTabPageDescriptor | null {
  const purchaseEdit = pathname.match(/^\/purchase\/([^/]+)\/edit$/);
  if (purchaseEdit) {
    const purchaseId = decodePathPart(purchaseEdit[1] || "");
    return staticPage(`purchase-edit:${purchaseId}`, () => <PurchaseEditPage purchaseId={purchaseId} />);
  }
  const purchaseDetail = pathname.match(/^\/purchase\/([^/]+)$/);
  if (purchaseDetail) {
    const purchaseId = decodePathPart(purchaseDetail[1] || "");
    return staticPage(`purchase-detail:${purchaseId}`, () => <PurchaseDetailPage purchaseId={purchaseId} />);
  }
  return staticPages[pathname] || null;
}
