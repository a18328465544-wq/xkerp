import {useEffect, useMemo, useState} from "react";
import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "@/src/components/common/ErpDialogShell";
import {ErpSearchInput} from "@/src/components/common/ErpSearchInput";
import {ErpSegmentedControl} from "@/src/components/common/ErpSegmentedControl";
import {ErpLoadingState} from "@/src/components/common/ErpLoadingState";
import {ErpPageError} from "@/src/components/common/ErpPageError";
import {useProductBrandCatalog} from "@/src/hooks/useProductBrandCatalog";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {notify} from "@/src/utils/notification";
import type {ProductBrandLegacyMatch, ProductBrandRecord} from "@/src/types/productBrand";
import {ProductBrandEditor} from "./ProductBrandEditor";
import {ProductBrandPicker} from "./ProductBrandPicker";

export function ProductBrandManager({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const [tab, setTab] = useState("brands"), [search, setSearch] = useState(""), [busy, setBusy] = useState(false);
  const catalog = useProductBrandCatalog(open, tab === "legacy");
  const [editing, setEditing] = useState<{initialName?: string; brand?: ProductBrandRecord} | null>(null);
  useEffect(() => {if (!open) {setEditing(null); setSearch("");}}, [open]);
  const brands = catalog.data?.brands || [];
  const groups = useMemo(() => {
    const result = new Map<string, ProductBrandLegacyMatch[]>();
    for (const product of catalog.data?.legacyMatches || []) {
      if (search && !`${product.productName} ${product.originalBrand}`.toLowerCase().includes(search.toLowerCase())) continue;
      const group = result.get(product.originalBrand) || []; group.push(product); result.set(product.originalBrand, group);
    }
    return [...result.entries()];
  }, [catalog.data?.legacyMatches, search]);
  usePhoneBackLayer(open && Boolean(editing), () => {if (!busy) setEditing(null);}, 600);
  const canManage = catalog.data?.canManage === true;
  return <ErpDialogShell open={open} title={editing ? editing.brand ? "新增品牌别名" : "新建商品品牌" : "品牌管理"} size="lg" mobilePresentation="fullscreen" pending={busy} onOpenChange={next => {if (!next && editing) setEditing(null); else onOpenChange(next);}} description={editing ? "品牌跨商品分类复用，已有别名不能重复归属。" : "统一品牌名称与别名，确认历史商品的品牌归属。"}
    toolbar={!editing ? <div className="space-y-3"><ErpSegmentedControl label="品牌管理内容" value={tab} options={[{value: "brands", label: "品牌目录"}, {value: "legacy", label: "历史匹配"}]} onValueChange={value => {setTab(value); setSearch("");}} /><ErpSearchInput value={search} onChange={event => setSearch(event.target.value)} aria-label="搜索品牌管理" placeholder={tab === "brands" ? "搜索品牌或别名" : "搜索原品牌或商品名称"} /></div> : undefined}
    footer={editing ? <><Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>返回品牌管理</Button><Button variant="primary" type="submit" form="brand-management-form" loading={busy}>保存品牌</Button></> : <><Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>关闭</Button>{canManage && tab === "brands" && <Button variant="primary" onClick={() => setEditing({initialName: search})}>新建品牌</Button>}</>}
  >
    {editing ? <ProductBrandEditor {...editing} formId="brand-management-form" onBusy={setBusy} createBrand={catalog.createBrand} addAliases={catalog.addAliases} onSaved={() => {setEditing(null); notify.success("品牌已保存");}} /> : catalog.isPending ? <ErpLoadingState title="正在读取品牌" /> : catalog.isError ? <ErpPageError title="暂时无法读取品牌" description="请稍后重试。" onRetry={() => {void catalog.refetch();}} /> : tab === "brands" ? <div className="divide-y divide-[var(--erp-color-border)]">{brands.filter(brand => `${brand.name} ${brand.aliases.join(" ")}`.toLowerCase().includes(search.toLowerCase())).map(brand => <div key={brand.id} className="flex min-w-0 items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{brand.name}</p><p className="break-words text-xs text-[var(--erp-color-text-secondary)]">{brand.aliases.join(" / ") || "暂无别名"}</p></div>{canManage && <Button variant="ghost" size="sm" onClick={() => setEditing({brand})}>补充别名</Button>}</div>)}</div> : catalog.legacyQuery.isPending ? <ErpLoadingState title="正在读取历史品牌" /> : catalog.legacyQuery.isError ? <ErpPageError title="暂时无法读取历史品牌" description="请稍后重试。" onRetry={() => {void catalog.legacyQuery.refetch();}} /> : <div className="space-y-3"><p className="text-xs text-[var(--erp-color-text-secondary)]">精确匹配已有别名；未匹配项需要选择品牌后确认。确认只补品牌归属，保留原商品名和历史记录。</p>{!groups.length && <p className="text-sm text-[var(--erp-color-text-secondary)]">没有待确认的商品品牌。</p>}{groups.map(([original, products]) => <LegacyBrandGroup key={original} original={original} products={products} brands={brands} disabled={!canManage || busy} onBind={async brandId => {setBusy(true); try {await catalog.bindBrands(products.slice(0, 200).map(product => ({productId: product.productId, expectedBrand: product.originalBrand, brandId}))); notify.success("商品品牌归属已确认");} catch (error) {notify.error(error instanceof Error ? error.message : "暂时无法保存，请稍后重试");} finally {setBusy(false);}}} />)}</div>}
  </ErpDialogShell>;
}

function LegacyBrandGroup({original, products, brands, disabled, onBind}: {original: string; products: ProductBrandLegacyMatch[]; brands: ProductBrandRecord[]; disabled: boolean; onBind: (brandId: string) => Promise<void>}) {
  const [brandId, setBrandId] = useState(products[0]?.suggestedBrandId || "");
  return <section className="space-y-2 border-b border-[var(--erp-color-border)] py-3"><p className="text-sm font-medium">原品牌：{original || "未填写"} · {products.length} 款</p><p className="break-words text-xs text-[var(--erp-color-text-secondary)]">{products.slice(0, 3).map(product => product.productName).join("、")}{products.length > 3 ? "等" : ""}</p><div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><ProductBrandPicker brands={brands} value={brandId} disabled={disabled} onSelect={brand => setBrandId(brand?.id || "")} /></div><Button variant="secondary" disabled={disabled || !brandId} onClick={() => {void onBind(brandId);}}>{products.length > 200 ? "确认前200款" : "确认绑定"}</Button></div></section>;
}
