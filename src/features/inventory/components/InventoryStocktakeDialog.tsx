import {useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {AlertTriangle, Check, ClipboardCheck, Plus, ScanLine, Trash2} from "lucide-react";
import {Button, Input, Select} from "@/src/components/ui";
import {ErpBarcodeScannerDialog, ErpDialogShell, ErpLoadingState} from "@/src/components/common";
import {inventoryApi, queryKeys} from "@/src/services/api";
import type {InventoryStocktakeRecord} from "@/src/types/inventory";
import {formatStoreDateTime} from "@/src/utils/storeTime";

export function InventoryStocktakeDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const queryClient = useQueryClient();
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [result, setResult] = useState<InventoryStocktakeRecord | null>(null);

  useEffect(() => {
    if (!open) return;
    setWarehouseLocation("");
    setScannedCodes([]);
    setManualCode("");
    setResult(null);
  }, [open]);

  const reference = useQuery({
    queryKey: queryKeys.inventory.stocktakeReference(warehouseLocation),
    queryFn: ({signal}) => inventoryApi.stocktakeReference(warehouseLocation, signal),
    enabled: open,
    retry: false,
  });
  const locationReference = useQuery({
    queryKey: queryKeys.inventory.stocktakeReference(""),
    queryFn: ({signal}) => inventoryApi.stocktakeReference("", signal),
    enabled: open,
    retry: false,
  });
  const history = useQuery({
    queryKey: queryKeys.inventory.stocktakes(1, 5),
    queryFn: ({signal}) => inventoryApi.listStocktakes(1, 5, signal),
    enabled: open,
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => {
      if (!reference.data) throw new Error("盘点名单尚未加载完成");
      return inventoryApi.createStocktake({warehouseLocation, snapshotToken: reference.data.snapshotToken, scannedCodes});
    },
    onSuccess: async (record) => {
      setResult(record);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: queryKeys.inventory.stocktakes(1, 5)}),
        queryClient.invalidateQueries({queryKey: queryKeys.state.all()}),
      ]);
    },
  });
  const locations = useMemo(() => Array.from(new Set((locationReference.data?.items || []).map((item) => item.warehouseLocation).filter((location) => location && location !== "未分配库位"))).sort((left, right) => left.localeCompare(right, "zh-Hans-CN")), [locationReference.data?.items]);

  const addCode = (value: string) => {
    const code = value.trim();
    if (!code) return;
    setScannedCodes((items) => [...items, code]);
    setManualCode("");
    setResult(null);
    save.reset();
  };

  const changeLocation = (value: string) => {
    setWarehouseLocation(value);
    setScannedCodes([]);
    setResult(null);
    save.reset();
  };

  const submit = () => {
    if (!scannedCodes.length || !reference.data || save.isPending) return;
    save.mutate();
  };

  return <>
    <ErpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-[var(--erp-color-primary)]" />库存盘点</span>}
      description="扫描货架上的 SN 或库存编号，与系统当前在库名单核对；盘点只生成记录，不会自动调整库存。"
      size="xl"
      mobilePresentation="fullscreen"
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>关闭</Button>
        <Button variant="primary" onClick={submit} disabled={!scannedCodes.length || !reference.data || save.isPending}>{save.isPending ? "正在核对…" : "完成盘点并保存"}</Button>
      </>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block space-y-1.5 text-sm font-medium text-[var(--erp-color-text)]">
            <span>盘点库位</span>
            <Select aria-label="盘点库位" value={warehouseLocation} onValueChange={changeLocation} options={[{value: "", label: "全部库位"}, ...locations.map((location) => ({value: location, label: location}))]} />
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setScannerOpen(true)}><ScanLine className="h-4 w-4" />连续扫码</Button>
            <Button type="button" variant="ghost" disabled={!scannedCodes.length} onClick={() => {setScannedCodes([]); setResult(null); save.reset();}}><Trash2 className="h-4 w-4" />清空</Button>
          </div>
        </div>

        {reference.isPending ? <ErpLoadingState title="正在读取系统在库名单" /> : reference.error ? <div role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-sm text-[var(--erp-color-danger)]">{(reference.error as Error).message}</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CountCard label="系统在库" value={reference.data?.items.length || 0} />
          <CountCard label="本次已扫" value={scannedCodes.length} />
          <CountCard label="已匹配" value={result?.matchedCount ?? "—"} />
          <CountCard label="待核差异" value={result ? result.missingItems.length + result.unexpectedCodes.length : "提交后核对"} />
        </div>}

        <form className="flex gap-2" onSubmit={(event) => {event.preventDefault(); addCode(manualCode);}}>
          <Input aria-label="手动录入盘点条码" autoComplete="off" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="扫码枪输入或手动粘贴 SN / 库存编号" />
          <Button type="submit" variant="secondary" disabled={!manualCode.trim()}><Plus className="h-4 w-4" />加入</Button>
        </form>

        {scannedCodes.length > 0 && <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)]">
          <header className="flex items-center justify-between border-b border-[var(--erp-color-border)] px-4 py-3"><h3 className="text-sm font-semibold">本次扫描记录</h3><span className="text-xs text-[var(--erp-color-text-muted)]">重复扫描会保留并在结果中标记</span></header>
          <ol className="erp-scrollbar max-h-52 divide-y divide-[var(--erp-color-border-soft)] overflow-y-auto px-4">
            {scannedCodes.map((code, index) => <li key={`${index}-${code}`} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-xs text-[var(--erp-color-text-muted)]">{index + 1}.</span>{code}</span><Button type="button" size="icon" variant="ghost" aria-label={`移除 ${code}`} onClick={() => {setScannedCodes((items) => items.filter((_, itemIndex) => itemIndex !== index)); setResult(null);}}><Trash2 className="h-4 w-4" /></Button></li>)}
          </ol>
        </section>}

        {save.error && <div role="alert" className="flex items-start gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-sm text-[var(--erp-color-warning)]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{(save.error as Error).message}</span></div>}

        {result && <section className="space-y-4 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4" aria-live="polite">
          <div className="flex items-start gap-3"><span className="rounded-full bg-[var(--erp-color-success-soft)] p-2 text-[var(--erp-color-success)]"><Check className="h-4 w-4" /></span><div><h3 className="font-semibold">盘点记录已保存</h3><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{result.id} · {result.handler} · {formatStoreDateTime(result.createdAt)} · {result.warehouseLocation || "全部库位"}</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
            <DifferenceList title={`系统有、货架没有（${result.missingItems.length}）`} emptyLabel="没有发现缺失库存" rows={result.missingItems.map((item) => `${item.serialNumber || item.inventoryId} · ${item.productName} · ${item.warehouseLocation}`)} />
            <DifferenceList title={`货架有、系统没有（${result.unexpectedCodes.length}）`} emptyLabel="没有发现多出编码" rows={result.unexpectedCodes} />
          </div>
          {(result.duplicateCodes.length > 0 || result.ambiguousCodes.length > 0) && <div className="space-y-2 text-xs text-[var(--erp-color-warning)]">{result.duplicateCodes.length > 0 && <p>重复扫描：{result.duplicateCodes.join("、")}</p>}{result.ambiguousCodes.length > 0 && <p>编码匹配到多张库存卡，请人工核对：{result.ambiguousCodes.join("、")}</p>}</div>}
        </section>}

        <section className="space-y-2"><h3 className="text-sm font-semibold">最近盘点记录</h3>{history.isPending ? <p className="text-xs text-[var(--erp-color-text-muted)]">正在读取历史记录…</p> : history.error ? <p className="text-xs text-[var(--erp-color-text-muted)]">历史记录暂时无法加载。</p> : history.data?.data.length ? <ul className="divide-y divide-[var(--erp-color-border-soft)] rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] px-3">{history.data.data.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{item.createdAt.slice(0, 10)} · {item.warehouseLocation || "全部库位"} · 扫描 {item.scannedCount} 个</span><span className="text-[var(--erp-color-text-secondary)]">缺失 {item.missingItems.length} · 多出 {item.unexpectedCodes.length}</span></li>)}</ul> : <p className="text-xs text-[var(--erp-color-text-muted)]">暂无盘点记录。</p>}</section>
      </div>
    </ErpDialogShell>
    <ErpBarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onDetected={addCode} continuous title="库存连续盘点" description="扫描当前库位内的显卡 SN 或库存编号，识别后继续扫描下一张。" />
  </>;
}

function CountCard({label, value}: {label: string; value: number | string}) {
  return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-secondary)]">{label}</p><p className="mt-1 erp-data-number text-lg font-semibold text-[var(--erp-color-text)]">{value}</p></div>;
}

function DifferenceList({title, emptyLabel, rows}: {title: string; emptyLabel: string; rows: string[]}) {
  return <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3"><h4 className="text-xs font-semibold">{title}</h4>{rows.length ? <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-[var(--erp-color-text-secondary)]">{rows.map((row, index) => <li key={`${index}-${row}`} className="break-all">{row}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">{emptyLabel}</p>}</div>;
}
