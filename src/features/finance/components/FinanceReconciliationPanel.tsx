import {AlertTriangle, CircleAlert} from "lucide-react";
import {DashboardSection, ErpEmptyState, ErpStatusBadge} from "@/src/components/common";
import type {FinanceReconciliationReport} from "@/src/types/finance-reconciliation";

export function FinanceReconciliationPanel({report}: {report: FinanceReconciliationReport}) {
  const tone = report.summary.errorCount > 0 ? "danger" : report.summary.warningCount > 0 ? "warning" : "success";
  const label = report.summary.errorCount > 0
    ? `${report.summary.errorCount} 项异常`
    : report.summary.warningCount > 0
      ? `${report.summary.warningCount} 项提示`
      : "账务链正常";
  return (
    <DashboardSection
      title="账务体检"
      description={`已检查 ${report.summary.accountCount} 个账户、${report.summary.paymentCount} 笔收付款与 ${report.summary.returnCount} 张退货单。`}
      actions={<ErpStatusBadge label={label} tone={tone} />}
    >
      {report.issues.length ? (
        <div className="space-y-2">
          {report.issues.slice(0, 6).map((issue, index) => (
            <div key={`${issue.code}-${issue.entityId || index}`} className="flex items-start gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm">
              {issue.severity === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-danger)]" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-warning)]" />}
              <span className="text-[var(--erp-color-text-secondary)]">{issue.message}</span>
            </div>
          ))}
          {report.truncated ? <p className="text-xs text-[var(--erp-color-text-muted)]">仅显示前 6 项，完整结果请查看账务体检接口返回。</p> : null}
        </div>
      ) : (
        <ErpEmptyState title="暂未发现账务漂移" description="账户余额、收付款关联、单据结算和退货资金链通过检查。" />
      )}
    </DashboardSection>
  );
}
