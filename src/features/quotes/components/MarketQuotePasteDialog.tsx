import {Button, Textarea} from "@/src/components/ui";
import {ErpDialogShell, ErpStatusBadge} from "@/src/components/common";
import {CORE_QUOTE_PASTE_HEADER, MAX_QUOTE_PASTE_ROWS, parseMarketQuotePaste, type QuotePasteResult} from "../quote.import";

export function MarketQuotePasteDialog({open, value, pending, onValueChange, onOpenChange, onImport}: {open: boolean; value: string; pending: boolean; onValueChange: (value: string) => void; onOpenChange: (open: boolean) => void; onImport: (result: QuotePasteResult) => void}) {
  const result = parseMarketQuotePaste(value);
  return <ErpDialogShell open={open} onOpenChange={onOpenChange} pending={pending} size="lg" mobilePresentation="fullscreen" title="批量粘贴核心基础价" description={"仅支持完整核心型号，每个核心一套基础价。单次最多 " + MAX_QUOTE_PASTE_ROWS + " 行，错误修正后才能导入。"} footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="button" variant="primary" onClick={() => onImport(result)} disabled={pending || !result.rows.length || result.errors.length > 0} loading={pending}>{"导入 " + result.rows.length + " 行"}</Button></>}>
    <div className="space-y-4">
      <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] p-3 erp-data-number text-xs leading-6 text-[var(--erp-color-text-secondary)]">
        表头：{CORE_QUOTE_PASTE_HEADER}<br />示例：RTX4070TI,3800,4300,,基准<br />完整型号保留 RTX 等前缀，大小写统一为大写；单侧未报价、有效期可留空，不需要填写报价来源。<br />旧简写及带来源的历史核心格式仍可读取。旧商品行拒绝导入，不使用货况列。
      </div>
      <Textarea className="min-h-52" value={value} onChange={(event) => onValueChange(event.target.value)} disabled={pending} placeholder={"RTX4070TI,3800,4300,,基准"} />
      <div className="flex flex-wrap gap-2"><ErpStatusBadge label={"有效 " + result.rows.length + " 行"} tone={result.rows.length ? "success" : "neutral"} />{result.errors.length > 0 && <ErpStatusBadge label={"错误 " + result.errors.length + " 行"} tone="danger" />}</div>
      {result.errors.length > 0 && <div className="max-h-28 overflow-y-auto rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{result.errors.slice(0, 8).map((error) => <p key={error}>{error}</p>)}</div>}
    </div>
  </ErpDialogShell>;
}
