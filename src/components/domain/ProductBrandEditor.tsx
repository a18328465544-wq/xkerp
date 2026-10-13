import {useState} from "react";
import {Input, Textarea} from "@/src/components/ui";
import {ErpField} from "@/src/components/common/ErpField";
import type {ProductBrandInput, ProductBrandRecord} from "@/src/types/productBrand";

export function ProductBrandEditor({initialName, brand, formId, onSaved, onBusy, createBrand, addAliases}: {initialName?: string; brand?: ProductBrandRecord; formId: string; onSaved: (brand: ProductBrandRecord) => void; onBusy: (busy: boolean) => void; createBrand: (input: ProductBrandInput) => Promise<ProductBrandRecord>; addAliases?: (id: string, aliases: string[]) => Promise<ProductBrandRecord>}) {
  const [name, setName] = useState(brand?.name || initialName || ""), [aliases, setAliases] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form id={formId} className="space-y-3" onSubmit={event => {
    event.preventDefault(); if (busy) return;
    const input = {name: name.trim(), aliases: aliases.split(/[\n,，;；]/).map(value => value.trim()).filter(Boolean)};
    if (!input.name || brand && !input.aliases.length) {setError(brand ? "请填写至少一个新别名" : "请填写品牌名称"); return;}
    setBusy(true); onBusy(true); setError("");
    const save = brand && addAliases ? addAliases(brand.id, input.aliases) : createBrand(input);
    void save.then(onSaved).catch(reason => setError(reason instanceof Error ? reason.message : "暂时无法保存品牌，请稍后重试")).finally(() => {setBusy(false); onBusy(false);});
  }}>
    <ErpField label="统一品牌名称" required><Input aria-label="统一品牌名称" value={name} readOnly={Boolean(brand)} disabled={busy} maxLength={80} placeholder="例如：华硕" onChange={event => setName(event.target.value)} /></ErpField>
    <ErpField label={brand ? "新增别名" : "品牌别名（选填）"} hint="英文名、常用简称用逗号或换行分隔，例如 ASUS。"><Textarea aria-label="品牌别名" value={aliases} disabled={busy} onChange={event => setAliases(event.target.value)} /></ErpField>
    {brand && <p className="text-sm text-[var(--erp-color-text-secondary)]">已有别名：{brand.aliases.join(" / ") || "无"}</p>}
    {error && <p role="alert" className="text-sm text-[var(--erp-color-danger)]">{error}</p>}
  </form>;
}
