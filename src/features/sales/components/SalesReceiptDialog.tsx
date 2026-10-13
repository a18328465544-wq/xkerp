import {Printer, Share2} from "lucide-react";
import {ErpDialogShell} from "@/src/components/common";
import {Button} from "@/src/components/ui";
import {BRAND} from "@/src/config/brand";
import {formatCurrency} from "@/src/lib/format";
import type {SalesListItem} from "@/src/types/sales";
import {notify} from "@/src/utils/notification";

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"})[character] || character);

type ReceiptPalette = {surface: string; text: string; secondary: string; border: string; primary: string};
const receiptPaletteTokens = {
  surface: "--erp-color-surface",
  text: "--erp-color-text",
  secondary: "--erp-color-text-secondary",
  border: "--erp-color-border",
  primary: "--erp-color-primary",
} as const;

function readReceiptPalette(): ReceiptPalette {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(receiptPaletteTokens).map(([key, token]) => [key, styles.getPropertyValue(token).trim() || `var(${token})`])) as ReceiptPalette;
}

export function buildSalesReceiptSvgMarkup(item: SalesListItem, palette: ReceiptPalette = {
  surface: "var(--erp-color-surface)",
  text: "var(--erp-color-text)",
  secondary: "var(--erp-color-text-secondary)",
  border: "var(--erp-color-border)",
  primary: "var(--erp-color-primary)",
}) {
  const height = 680 + item.lines.length * 92;
  const lines = item.lines.map((line, index) => {
    const y = 392 + index * 92;
    const serial = line.sn || "待出库绑定 SN";
    return `<g><text x="64" y="${y}" class="name">${escapeXml(line.productName)}</text><text x="64" y="${y + 30}" class="sub">SN ${escapeXml(serial)}　·　成色 ${escapeXml(line.condition || "—")}　·　${line.quantity} 件</text><text x="836" y="${y + 12}" class="amount" text-anchor="end">${escapeXml(formatCurrency(line.sellPrice * line.quantity))}</text><line x1="64" y1="${y + 54}" x2="836" y2="${y + 54}" class="rule" /></g>`;
  }).join("");
  const storeWarranty = item.storeWarrantyDays && item.storeWarrantyDays > 0 ? `店保 ${item.storeWarrantyDays} 天` : "未单独设置店保";
  const orderState = item.outboundStatus === "已出库" ? `已出库${item.outboundTime ? ` · ${item.outboundTime}` : ""}` : "待出库 · 出库后绑定实际 SN";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}"><style>.bg{fill:${palette.surface}}.title{font:700 34px sans-serif;fill:${palette.text}}.label{font:16px sans-serif;fill:${palette.secondary}}.value{font:600 18px sans-serif;fill:${palette.text}}.sub{font:15px sans-serif;fill:${palette.secondary}}.name{font:600 19px sans-serif;fill:${palette.text}}.amount{font:600 18px sans-serif;fill:${palette.text}}.rule{stroke:${palette.border};stroke-width:1}.total{font:700 24px sans-serif;fill:${palette.text}}.brand{font:14px sans-serif;fill:${palette.secondary}}.badge{font:600 14px sans-serif;fill:${palette.primary}}</style><rect class="bg" width="900" height="${height}"/><text x="64" y="78" class="brand">${escapeXml(`${BRAND.name} · ${BRAND.product}`)} · 购买凭证</text><text x="64" y="132" class="title">购买凭证</text><text x="64" y="178" class="label">单据编号</text><text x="64" y="207" class="value">${escapeXml(item.invoiceNo)}</text><text x="500" y="178" class="label">日期</text><text x="500" y="207" class="value">${escapeXml(item.outboundTime || item.date)}</text><text x="64" y="254" class="label">客户</text><text x="64" y="283" class="value">${escapeXml(item.customerName || "未记录客户")}</text><text x="500" y="254" class="label">联系电话</text><text x="500" y="283" class="value">${escapeXml(item.contact || "未记录")}</text><text x="64" y="330" class="badge">${escapeXml(orderState)}</text><line x1="64" y1="354" x2="836" y2="354" class="rule"/>${lines}<text x="64" y="${height - 206}" class="label">店铺保修</text><text x="64" y="${height - 176}" class="value">${escapeXml(storeWarranty)}</text><text x="500" y="${height - 206}" class="label">售后条款</text><text x="500" y="${height - 176}" class="value">${escapeXml(item.aftersalesTerms || "未填写")}</text><line x1="64" y1="${height - 144}" x2="836" y2="${height - 144}" class="rule"/><text x="500" y="${height - 90}" class="label">实付 / 应付</text><text x="836" y="${height - 90}" class="total" text-anchor="end">${escapeXml(formatCurrency(item.totalAmount))}</text><text x="64" y="${height - 42}" class="brand">本凭证根据系统销售单生成；待出库单据的实际 SN 以出库绑定结果为准。</text></svg>`;
}

async function renderReceiptPng(svg: string): Promise<Blob> {
  const source = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml;charset=utf-8"}));
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法生成凭证图片");
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("凭证图片生成失败，请改用打印保存 PDF");
    return blob;
  } finally {URL.revokeObjectURL(source);}
}

export function SalesReceiptDialog({item, open, onOpenChange}: {item: SalesListItem | null; open: boolean; onOpenChange: (open: boolean) => void}) {
  if (!item) return null;
  const shareOrSave = async () => {
    try {
      const blob = await renderReceiptPng(buildSalesReceiptSvgMarkup(item, readReceiptPalette()));
      const file = new File([blob], `${item.invoiceNo}-购买凭证.png`, {type: "image/png"});
      const shareNavigator = navigator as Navigator & {canShare?: (data: ShareData) => boolean};
      if (navigator.share && shareNavigator.canShare?.({files: [file]})) {
        await navigator.share({files: [file], title: `${item.invoiceNo} 购买凭证`});
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      notify.success("购买凭证图片已保存");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify.error(error instanceof Error ? error.message : "凭证图片生成失败，请改用打印保存 PDF");
    }
  };
  return <>
    <style>{`@media print { @page { margin: 14mm; } body * { visibility: hidden !important; } .erp-sales-receipt-print-root, .erp-sales-receipt-print-root * { visibility: visible !important; } .erp-sales-receipt-print-root { position: fixed !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: 900px !important; padding: 32px !important; border: 0 !important; box-shadow: none !important; background: var(--erp-color-surface) !important; color: var(--erp-color-text) !important; } .erp-sales-receipt-print-root * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; } }`}</style>
    <ErpDialogShell open={open} onOpenChange={onOpenChange} size="lg" mobilePresentation="sheet" title="销售购买凭证" description="可打印或保存为 PDF，也可保存 / 分享凭证图片。待出库单据会明确标记实际 SN 尚未绑定。" footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button><Button type="button" variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />打印 / 保存 PDF</Button><Button type="button" variant="primary" onClick={() => void shareOrSave()}><Share2 className="h-4 w-4" /><span className="sm:hidden">保存图片</span><span className="hidden sm:inline">保存 / 分享图片</span></Button></>}>
      <article className="erp-sales-receipt-print-root mx-auto max-w-3xl rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5 text-[var(--erp-color-text)] sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-color-border)] pb-5"><div><p className="text-xs font-medium text-[var(--erp-color-text-muted)]">{BRAND.name} · {BRAND.product} · 购买凭证</p><h2 className="mt-2 text-2xl font-bold">购买凭证</h2></div><span className="rounded-full bg-[var(--erp-color-info-soft)] px-3 py-1 text-xs font-semibold text-[var(--erp-color-primary)]">{item.outboundStatus === "已出库" ? "已出库" : "待出库 · SN 待绑定"}</span></div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><ReceiptFact label="销售单号" value={item.invoiceNo} /><ReceiptFact label="日期" value={item.outboundTime || item.date} /><ReceiptFact label="客户" value={item.customerName || "未记录客户"} /><ReceiptFact label="联系方式" value={item.contact || "未记录"} /></dl>
        <div className="mt-6 space-y-3"><h3 className="text-sm font-semibold">商品明细</h3>{item.lines.map((line) => <div key={line.id} className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-semibold">{line.productName}</p><p className="shrink-0 erp-data-number text-sm font-semibold">{formatCurrency(line.sellPrice * line.quantity)}</p></div><p className="mt-2 break-all font-mono text-xs text-[var(--erp-color-text-secondary)]">SN：{line.sn || "待出库绑定"}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">成色：{line.condition || "—"} · 数量：{line.quantity} 件 · 单价：{formatCurrency(line.sellPrice)}</p></div>)}</div>
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--erp-color-border)] pt-4 text-sm"><ReceiptFact label="店铺保修" value={item.storeWarrantyDays && item.storeWarrantyDays > 0 ? `${item.storeWarrantyDays} 天` : "未单独设置"} /><ReceiptFact label="售后条款" value={item.aftersalesTerms || "未填写"} /></div>
        <div className="mt-6 flex items-baseline justify-between border-t border-[var(--erp-color-border)] pt-4"><span className="text-sm text-[var(--erp-color-text-secondary)]">销售金额</span><strong className="erp-data-number text-xl">{formatCurrency(item.totalAmount)}</strong></div>
        <p className="mt-5 text-xs leading-5 text-[var(--erp-color-text-muted)]">凭证根据系统销售单生成；如果单据仍待出库，实际商品序列号以出库绑定结果为准。</p>
      </article>
    </ErpDialogShell>
  </>;
}

function ReceiptFact({label, value}: {label: string; value: string}) {
  return <div className="min-w-0"><dt className="text-xs text-[var(--erp-color-text-muted)]">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>;
}
