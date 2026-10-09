import {useEffect, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {CalendarClock, Copy, ExternalLink, Search, Save} from "lucide-react";
import {Button, Input, Select} from "@/src/components/ui";
import {ErpDialogShell} from "@/src/components/common/ErpDialogShell";
import {ErpField} from "@/src/components/common/ErpField";
import {ErpStatusBadge} from "@/src/components/common/ErpStatusBadge";
import {gpuSnDateApi, queryKeys} from "@/src/services/api";
import type {GpuSnBrandId, GpuSnDateResult} from "@/src/types/gpuSn";

const brands: Array<{id: GpuSnBrandId; name: string}> = [
  {id: "asus", name: "华硕 ASUS"}, {id: "msi", name: "微星 MSI"}, {id: "gigabyte", name: "技嘉 GIGABYTE"},
  {id: "colorful", name: "七彩虹 Colorful"}, {id: "galax", name: "影驰 GALAX"}, {id: "zotac", name: "索泰 ZOTAC"},
  {id: "gainward", name: "耕升 Gainward"}, {id: "maxsun", name: "铭瑄 MAXSUN"}, {id: "sapphire", name: "蓝宝石 Sapphire"},
  {id: "powercolor", name: "撼讯 PowerColor"}, {id: "xfx", name: "讯景 XFX"}, {id: "nvidia", name: "NVIDIA 公版"},
];

function brandId(value?: string): GpuSnBrandId | "" {
  const text = (value || "").toLowerCase();
  if (text.includes("asus") || text.includes("华硕")) return "asus";
  if (text.includes("msi") || text.includes("微星")) return "msi";
  if (text.includes("gigabyte") || text.includes("技嘉")) return "gigabyte";
  if (text.includes("colorful") || text.includes("七彩虹")) return "colorful";
  if (text.includes("galax") || text.includes("影驰")) return "galax";
  if (text.includes("zotac") || text.includes("索泰")) return "zotac";
  if (text.includes("gainward") || text.includes("耕升")) return "gainward";
  if (text.includes("maxsun") || text.includes("铭瑄")) return "maxsun";
  if (text.includes("sapphire") || text.includes("蓝宝石")) return "sapphire";
  if (text.includes("powercolor") || text.includes("撼讯")) return "powercolor";
  if (text.includes("xfx") || text.includes("讯景")) return "xfx";
  return "";
}

export function GpuSnDateLookupButton({brand, sn, model, inventoryId, alreadySaved, label = "SN 出厂日期"}: {brand?: string; sn?: string; model?: string; inventoryId?: string; alreadySaved?: boolean; label?: string}) {
  const [open, setOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<GpuSnBrandId | "">(brandId(brand));
  const [serial, setSerial] = useState(sn || "");
  const [result, setResult] = useState<GpuSnDateResult | null>(null);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const parseMutation = useMutation({mutationFn: gpuSnDateApi.parse});
  const saveMutation = useMutation({mutationFn: gpuSnDateApi.save});

  useEffect(() => {
    if (!open) return;
    setSelectedBrand(brandId(brand)); setSerial(sn || ""); setResult(null); setMessage("");
  }, [brand, model, open, sn]);

  const parse = async () => {
    setMessage("");
    if (!selectedBrand) {setMessage("请先选择品牌。"); return;}
    try { setResult((await parseMutation.mutateAsync({brandId: selectedBrand, sn: serial, productModel: model})).data); }
    catch (error) { setMessage(error instanceof Error ? error.message : "查询失败，请稍后重试。"); }
  };
  const save = async () => {
    if (!inventoryId || !result || result.status !== "parsed") return;
    try {
      const response = await saveMutation.mutateAsync(inventoryId);
      setMessage(response.data.saved ? "推算结果已保存到库存档案。" : "档案已有出厂日期推算结果，未覆盖原记录。");
      await queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()});
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。"); }
  };
  const copy = async () => {
    if (!result) return;
    const text = [result.brandName, result.sn, result.dateRange ? `${result.dateRange.start} 至 ${result.dateRange.end}` : result.explanation, `规则：${result.ruleSummary}`, `可信度：${result.confidence}`].join("\n");
    try { await navigator.clipboard.writeText(text); setMessage("查询结果已复制。"); }
    catch { setMessage("浏览器未允许剪贴板访问，请手动复制结果。"); }
  };

  return <>
    <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><CalendarClock className="h-4 w-4" />{label}</Button>
    <ErpDialogShell open={open} onOpenChange={setOpen} title="显卡 SN 出厂日期查询" description="日期为基于公开编码规则的推算，不代表品牌官方单卡确认。" mobilePresentation="sheet" footer={<>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>关闭</Button>
      {result && <Button type="button" variant="secondary" onClick={() => void copy()}><Copy className="h-4 w-4" />复制结果</Button>}
      {inventoryId && result?.status === "parsed" && <Button type="button" variant="secondary" loading={saveMutation.isPending} disabled={alreadySaved || saveMutation.isPending} onClick={() => void save()}><Save className="h-4 w-4" />{alreadySaved ? "档案已有记录" : "保存到库存档案"}</Button>}
      <Button type="button" variant="primary" loading={parseMutation.isPending} disabled={!serial.trim() || !selectedBrand || parseMutation.isPending} onClick={() => void parse()}><Search className="h-4 w-4" />查询</Button>
    </>}>
      <div className="space-y-4">
        <ErpField label="品牌"><Select value={selectedBrand} onValueChange={(value) => setSelectedBrand(value as GpuSnBrandId | "")} options={brands.map((item) => ({value: item.id, label: item.name}))} placeholder="选择品牌" aria-label="显卡品牌" /></ErpField>
        <ErpField label="序列号 SN"><Input value={serial} onChange={(event) => setSerial(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter") {event.preventDefault(); void parse();}}} autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="显卡序列号 SN" placeholder="粘贴 SN 或使用扫码枪输入" className="font-mono uppercase" /></ErpField>
        {model && <p className="text-xs text-[var(--erp-color-text-muted)]">商品型号：{model}</p>}
        {result && <section aria-live="polite" className="space-y-3 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{result.brandName} · {result.sn}</h3><ErpStatusBadge label={result.status === "parsed" ? `推算可信度 ${result.confidence}` : result.status === "partial" ? "仅解析到部分信息" : result.status === "invalid" ? "SN 无法解析" : "规则待验证"} tone={result.status === "parsed" ? "info" : "warning"} /></div>
          {result.dateRange && <div><p className="text-2xl font-semibold tracking-tight text-[var(--erp-color-text)]">{result.year}年{result.month ? `${result.month}月` : result.week ? `第${result.week}周` : ""}</p><p className="mt-1 text-sm text-[var(--erp-color-primary)]">生产范围：{result.dateRange.start} 至 {result.dateRange.end}</p>{result.elapsedDays !== null && <p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">距今约 {result.elapsedDays} 天</p>}</div>}
          <p className="text-sm leading-relaxed text-[var(--erp-color-text-secondary)]">{result.explanation}</p>
          <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3"><p className="text-xs font-semibold">规则说明</p><p className="mt-1 text-xs leading-relaxed text-[var(--erp-color-text-secondary)]">{result.ruleSummary}</p><p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">规则：{result.ruleId} · 评分：{Math.round(result.confidenceScore * 100)}% · 单卡官方确认：否</p></div>
          <div className="space-y-1">{result.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center gap-1 text-xs text-[var(--erp-color-primary)] hover:underline"><ExternalLink className="h-3 w-3" />{source.title}（{source.evidence === "official" ? "官方资料" : "社区资料"}）</a>)}<a href={result.officialUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center gap-1 text-xs font-medium text-[var(--erp-color-primary)] hover:underline"><ExternalLink className="h-3 w-3" />打开品牌官方查询入口</a></div>
        </section>}
        {message && <p role="status" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] p-3 text-xs text-[var(--erp-color-text-secondary)]">{message}</p>}
        {!result && !message && <p className="text-xs leading-relaxed text-[var(--erp-color-text-muted)]">未找到公开可验证的编码时，系统会说明待验证原因并提供官方查询入口，不猜测日期。扫码枪可直接输入并回车查询。</p>}
      </div>
    </ErpDialogShell>
  </>;
}
