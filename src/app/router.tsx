import {createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, useParams} from "@tanstack/react-router";
import {AppShell} from "@/src/app/shell/AppShell";
import {ErpLoadingState, ErpPageError} from "@/src/components/common";
import {Card} from "@/src/components/ui";
import {AuthBoundary, PermissionBoundary} from "@/src/app/auth";
import {ApiError} from "@/src/services/api";

const DashboardPage = lazyRouteComponent(() => import("@/src/features/dashboard/pages/DashboardPage"), "DashboardPage");
const InventoryListPage = lazyRouteComponent(() => import("@/src/features/inventory/pages/InventoryListPage"), "InventoryListPage");
const SalesListPage = lazyRouteComponent(() => import("@/src/features/sales/pages/SalesListPage"), "SalesListPage");
const NewSalesOrderPage = lazyRouteComponent(() => import("@/src/features/sales/pages/NewSalesOrderPage"), "NewSalesOrderPage");
const SalesOutboundPage = lazyRouteComponent(() => import("@/src/features/sales/pages/SalesOutboundPage"), "SalesOutboundPage");
const AiInsightsPage = lazyRouteComponent(() => import("@/src/features/ai/pages/AiInsightsPage"), "AiInsightsPage");
const MarketQuotesPage = lazyRouteComponent(() => import("@/src/features/quotes/pages/MarketQuotesPage"), "MarketQuotesPage");
const ProductLibraryPage = lazyRouteComponent(() => import("@/src/features/products/pages/ProductLibraryPage"), "ProductLibraryPage");
const AssemblyWorkspacePage = lazyRouteComponent(() => import("@/src/features/assembly/pages/AssemblyWorkspacePage"), "AssemblyWorkspacePage");
const PurchaseListPage = lazyRouteComponent(() => import("@/src/features/purchase/pages/PurchaseListPage"), "PurchaseListPage");
const NewPurchaseOrderPage = lazyRouteComponent(() => import("@/src/features/purchase/pages/NewPurchaseOrderPage"), "NewPurchaseOrderPage");
const PurchaseDetailPage = lazyRouteComponent(() => import("@/src/features/purchase/pages/PurchaseDetailPage"), "PurchaseDetailPage");
const PurchaseEditPage = lazyRouteComponent(() => import("@/src/features/purchase/pages/PurchaseEditPage"), "PurchaseEditPage");
const InspectionWorkspacePage = lazyRouteComponent(() => import("@/src/features/inspections/pages/InspectionWorkspacePage"), "InspectionWorkspacePage");
const PurchaseReturnListPage = lazyRouteComponent(() => import("@/src/features/returns/pages/PurchaseReturnListPage"), "PurchaseReturnListPage");
const NewPurchaseReturnPage = lazyRouteComponent(() => import("@/src/features/returns/pages/NewPurchaseReturnPage"), "NewPurchaseReturnPage");
const SalesReturnListPage = lazyRouteComponent(() => import("@/src/features/returns/pages/SalesReturnListPage"), "SalesReturnListPage");
const NewSalesReturnPage = lazyRouteComponent(() => import("@/src/features/returns/pages/NewSalesReturnPage"), "NewSalesReturnPage");
const CrmWorkspacePage = lazyRouteComponent(() => import("@/src/features/crm/pages/CrmWorkspacePage"), "CrmWorkspacePage");
const NewCustomerLeadPage = lazyRouteComponent(() => import("@/src/features/crm/pages/NewCustomerLeadPage"), "NewCustomerLeadPage");
const CustomerDirectoryPage = lazyRouteComponent(() => import("@/src/features/customers/pages/CustomerDirectoryPage"), "CustomerDirectoryPage");
const VendorDirectoryPage = lazyRouteComponent(() => import("@/src/features/vendors/pages/VendorDirectoryPage"), "VendorDirectoryPage");
const AftersalesWorkspacePage = lazyRouteComponent(() => import("@/src/features/aftersales/pages/AftersalesWorkspacePage"), "AftersalesWorkspacePage");
const FinanceDashboardPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceDashboardPage"), "FinanceDashboardPage");
const FinanceAccountsPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceAccountsPage"), "FinanceAccountsPage");
const FinanceLedgerPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceLedgerPage"), "FinanceLedgerPage");
const FinanceIncomePage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceIncomePage"), "FinanceIncomePage");
const FinanceExpensePage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceExpensePage"), "FinanceExpensePage");
const FinanceTransfersPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceTransfersPage"), "FinanceTransfersPage");
const FinanceProfitPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceProfitPage"), "FinanceProfitPage");
const FinanceClosingPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceClosingPage"), "FinanceClosingPage");
const FinanceReturnReconcilePage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceReturnReconcilePage"), "FinanceReturnReconcilePage");
const FinanceCommissionPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceCommissionPage"), "FinanceCommissionPage");
const FinanceCustomerFundsPage = lazyRouteComponent(() => import("@/src/features/finance/pages/FinanceCustomerFundsPage"), "FinanceCustomerFundsPage");
const SettingsUsersPage = lazyRouteComponent(() => import("@/src/features/settings/pages/SettingsUsersPage"), "SettingsUsersPage");
const SettingsLogsPage = lazyRouteComponent(() => import("@/src/features/settings/pages/SettingsLogsPage"), "SettingsLogsPage");
const BackupPage = lazyRouteComponent(() => import("@/src/features/settings/pages/BackupPage"), "BackupPage");
const DesignSystemPage = lazyRouteComponent(() => import("@/src/features/design-system/pages/DesignSystemPage"), "DesignSystemPage");

function RootLayout() {
  return <AuthBoundary><PermissionBoundary><AppShell><Outlet /></AppShell></PermissionBoundary></AuthBoundary>;
}

function RouteLoadingState() {
  return <Card><ErpLoadingState title="正在打开页面" description="仅加载当前业务页面所需的资源。" /></Card>;
}

function RouteErrorState({error}: {error: unknown}) {
  const message = error instanceof Error ? error.message : "页面加载时发生未知错误。";
  return <ErpPageError title="页面暂时无法打开" description={message} requestId={error instanceof ApiError ? error.requestId : undefined} onRetry={() => window.location.reload()} />;
}

function RouteNotFoundState() {
  return <ErpPageError title="页面不存在" description="请从左侧导航重新选择一个工作区。" />;
}

const rootRoute = createRootRoute({component: RootLayout});
const dashboardRoute = createRoute({getParentRoute: () => rootRoute, path: "/", component: DashboardPage});
const inventoryRoute = createRoute({getParentRoute: () => rootRoute, path: "/inventory", component: InventoryListPage});
const salesRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales", component: SalesListPage});
const salesNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/new", component: NewSalesOrderPage});
const aiInsightsRoute = createRoute({getParentRoute: () => rootRoute, path: "/ai-insights", component: AiInsightsPage});
const quotesRoute = createRoute({getParentRoute: () => rootRoute, path: "/quotes", component: MarketQuotesPage});
const productsRoute = createRoute({getParentRoute: () => rootRoute, path: "/products", component: ProductLibraryPage});
const assemblyRoute = createRoute({getParentRoute: () => rootRoute, path: "/assembly", component: AssemblyWorkspacePage});
const purchaseRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase", component: PurchaseListPage});
const purchaseNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/new", component: NewPurchaseOrderPage});
function PurchaseDetailRouteComponent() {
  const {purchaseId} = useParams({strict: false}) as {purchaseId: string};
  return <PurchaseDetailPage purchaseId={purchaseId} />;
}
const purchaseDetailRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/$purchaseId", component: PurchaseDetailRouteComponent});
function PurchaseEditRouteComponent() {
  const {purchaseId} = useParams({strict: false}) as {purchaseId: string};
  return <PurchaseEditPage purchaseId={purchaseId} />;
}
const purchaseEditRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/$purchaseId/edit", component: PurchaseEditRouteComponent});
const inspectionsRoute = createRoute({getParentRoute: () => rootRoute, path: "/inspections", component: InspectionWorkspacePage});
const purchaseReturnsRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/returns", component: PurchaseReturnListPage});
const purchaseReturnsNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/returns/new", component: NewPurchaseReturnPage});
const salesOutboundRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/outbound", component: SalesOutboundPage});
const salesReturnsNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/returns/new", component: NewSalesReturnPage});
const salesReturnsRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/returns", component: SalesReturnListPage});
const crmRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm", component: CrmWorkspacePage});
const crmCustomersRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm/customers", component: CustomerDirectoryPage});
const crmCustomerNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm/customers/new", component: NewCustomerLeadPage});
const crmVendorsRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm/vendors", component: VendorDirectoryPage});
const aftersalesRoute = createRoute({getParentRoute: () => rootRoute, path: "/aftersales", component: AftersalesWorkspacePage});
const financeRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance", component: FinanceDashboardPage});
const financeAccountsRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/accounts", component: FinanceAccountsPage});
const financeLedgerRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/ledger", component: FinanceLedgerPage});
const financeIncomeRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/income", component: FinanceIncomePage});
const financeExpenseRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/expense", component: FinanceExpensePage});
const financeTransfersRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/transfers", component: FinanceTransfersPage});
const financeProfitRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/profit", component: FinanceProfitPage});
const financeClosingRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/closing", component: FinanceClosingPage});
const financeReturnReconcileRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/return-reconcile", component: FinanceReturnReconcilePage});
const financePurchaseCommissionRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/purchase-commission", component: () => <FinanceCommissionPage mode="purchase" />});
const financeCustomerFundsRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/customer-funds", component: FinanceCustomerFundsPage});
const financeSalesCommissionRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/sales-commission", component: () => <FinanceCommissionPage mode="sales" />});
const settingsRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings", component: SettingsUsersPage});
const settingsUsersRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings/users", component: SettingsUsersPage});
const settingsLogsRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings/logs", component: SettingsLogsPage});
const settingsBackupRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings/backup", component: BackupPage});
const designSystemRoute = createRoute({getParentRoute: () => rootRoute, path: "/__design-system", component: DesignSystemPage});

const routeTree = rootRoute.addChildren([
  dashboardRoute, aiInsightsRoute, quotesRoute, inventoryRoute, productsRoute, assemblyRoute,
  purchaseRoute, purchaseNewRoute, purchaseDetailRoute, purchaseEditRoute, inspectionsRoute, purchaseReturnsRoute, purchaseReturnsNewRoute,
  salesNewRoute, salesRoute, salesOutboundRoute, salesReturnsNewRoute, salesReturnsRoute,
  crmRoute, crmCustomersRoute, crmCustomerNewRoute, crmVendorsRoute, aftersalesRoute,
  financeRoute, financeAccountsRoute, financeLedgerRoute, financeIncomeRoute, financeExpenseRoute, financeTransfersRoute,
  financeProfitRoute, financeClosingRoute, financeReturnReconcileRoute, financePurchaseCommissionRoute,
  financeCustomerFundsRoute, financeSalesCommissionRoute,
  settingsRoute, settingsUsersRoute, settingsLogsRoute, settingsBackupRoute,
  designSystemRoute,
]);
export const router = createRouter({
  routeTree,
  // Unopened pages must not fetch route modules on hover, focus, or viewport
  // proximity. The keep-alive registry loads a page only when its Tab opens.
  defaultPreload: false,
  defaultPendingComponent: RouteLoadingState,
  defaultErrorComponent: RouteErrorState,
  defaultNotFoundComponent: RouteNotFoundState,
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router; }
}
