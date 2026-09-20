export type FinanceReconciliationSeverity = "error" | "warning";
export type FinanceReconciliationDomain = "accounts" | "payments" | "invoices" | "returns" | "classification";

export interface FinanceReconciliationIssue {
  code: string;
  severity: FinanceReconciliationSeverity;
  domain: FinanceReconciliationDomain;
  entityId?: string;
  relatedIds?: string[];
  message: string;
}

export interface FinanceReconciliationReport {
  generatedAt: string;
  healthy: boolean;
  truncated: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
    accountCount: number;
    paymentCount: number;
    invoiceCount: number;
    returnCount: number;
  };
  checks: {
    accountBalanceChains: number;
    paymentLedgerLinks: number;
    invoiceSettlements: number;
    returnFinanceInvariants: number;
  };
  issues: FinanceReconciliationIssue[];
}
