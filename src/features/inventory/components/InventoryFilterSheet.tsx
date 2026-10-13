import {useEffect, useMemo, useState, type ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import {CircleCheck, RotateCcw} from "lucide-react";
import {Button, Select, type SelectOption} from "@/src/components/ui";
import {ErpDialogShell, ErpSegmentedControl, type ErpFilterField} from "@/src/components/common";
import {ErpFilterChoiceRow} from "@/src/components/common/filters/ErpFilterChoiceRow";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {inventoryApi, queryKeys} from "@/src/services/api";
import {useProductBrandCatalog} from "@/src/hooks/useProductBrandCatalog";
import type {InventoryFilters} from "@/src/types/inventory";
import {applyInventorySheetFilters, inventoryFilterSourceOptions, inventoryFilterSourceQuery, inventorySheetSelectOptions, resetInventorySheetFilters, type InventoryFilterSource} from "../inventory.filter-sheet";

const sourceLabels: Record<InventoryFilterSource, string> = {brand: "品牌", supplierName: "供应商", warehouseLocation: "仓库 / 库位"};
const sourceAllLabels: Record<InventoryFilterSource, string> = {brand: "全部品牌", supplierName: "全部供应商", warehouseLocation: "全部库位"};

export function InventoryFilterSheet({open, onOpenChange, filters, fields, onApply}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: InventoryFilters;
  fields: readonly ErpFilterField[];
  onApply: (filters: InventoryFilters) => void;
}) {
  const [draft, setDraft] = useState<InventoryFilters>(() => ({...filters}));
  const [source, setSource] = useState<InventoryFilterSource | null>(null);
  const [search, setSearch] = useState("");
  const {active} = useWorkspaceTabActivity();
  const brandCatalog = useProductBrandCatalog(open && active);
  useEffect(() => {
    // Opening snapshots the committed query. Background refreshes cannot erase this draft.
    if (open) setDraft({...filters, status: filters.status || filters.inspectionStatus, inspectionStatus: ""});
    setSource(null);
    setSearch("");
  }, [open]);
  const debouncedSearch = useDebouncedValue(search, 250);
  const sourceFilters = useMemo(() => inventoryFilterSourceQuery(source ?? "brand", debouncedSearch), [source, debouncedSearch]);
  const suggestions = useQuery({queryKey: queryKeys.inventory.filterOptions(sourceFilters), queryFn: ({signal}) => inventoryApi.list(sourceFilters, {showCost: false, showProfit: false}, signal), enabled: open && active && Boolean(source) && source !== "brand", staleTime: 60_000, retry: false});
  const change = (patch: Partial<InventoryFilters>) => setDraft((previous) => ({...previous, ...patch}));
  const sourceOptions: SelectOption[] = source === "brand" ? [{value: "", label: "全部品牌", description: brandCatalog.isError ? "暂时无法读取品牌，请稍后重试。" : undefined}, ...(brandCatalog.data?.brands || []).map(brand => ({value: brand.name, label: brand.name, searchText: [brand.name, ...brand.aliases].join(" ")}))] : source ? [{value: "", label: sourceAllLabels[source], description: suggestions.isError ? `暂时无法读取${sourceLabels[source]}选项，可按关键词筛选或返回后重试。` : undefined}, ...inventoryFilterSourceOptions(suggestions.data?.data ?? [], source, draft[source], search).map((value) => ({value, label: value}))] : [];
  if (source !== "brand" && search.trim() && !sourceOptions.some((option) => option.value === search.trim())) sourceOptions.push({value: search.trim(), label: `匹配“${search.trim()}”`, description: "按输入的关键词筛选"});
  const categoryOptions = inventorySheetSelectOptions(fields, "category", "全部分类");
  const statusOptions = inventorySheetSelectOptions(fields, "status", "全部状态");
  const riskOptions = inventorySheetSelectOptions(fields, "risk", "全部风险");
  return <ErpDialogShell open={open} onOpenChange={onOpenChange} title="库存筛选" closeLabel="关闭库存筛选" mobilePresentation="sheet" className="erp-inventory-filter-sheet"
    footer={<><Button variant="secondary" onClick={() => setDraft(resetInventorySheetFilters(filters))}><RotateCcw className="h-5 w-5" />重置</Button><Button variant="primary" onClick={() => {onApply(applyInventorySheetFilters(draft, filters)); onOpenChange(false);}}>应用筛选</Button></>}>
    <div className="erp-inventory-filter-content">
      <FilterSection title="常用条件"><ErpSegmentedControl label="库存范围" className="erp-inventory-filter-scope" value={draft.includeSold ? "sold" : "current"} options={[{value: "current", label: <>{!draft.includeSold && <CircleCheck className="erp-inventory-filter-check h-5 w-5" />}当前库存</>}, {value: "sold", label: <>{draft.includeSold && <CircleCheck className="erp-inventory-filter-check h-5 w-5" />}包含已售出</>}]} onValueChange={(value) => change({includeSold: value === "sold", activeOnly: true, ...(value === "current" && draft.status === "已售出" ? {status: ""} : {})})} />
        <div className="erp-inventory-filter-rows"><InventorySelectRow label="商品分类" value={draft.category} options={categoryOptions} onValueChange={(category) => change({category: category as InventoryFilters["category"]})} /><InventorySelectRow label="库存状态" value={draft.status} options={statusOptions} onValueChange={(status) => change({status, inspectionStatus: "", includeSold: status === "已售出" || draft.includeSold})} /></div>
      </FilterSection>
      <FilterSection title="细化范围"><div className="erp-inventory-filter-rows">{(["brand", "supplierName", "warehouseLocation"] as const).map((key) => <ErpFilterChoiceRow key={key} label={sourceLabels[key]} value={draft[key] || sourceAllLabels[key]} onClick={() => {setSearch(""); setSource(key);}} />)}</div></FilterSection>
      <FilterSection title="更多条件"><InventorySelectRow label="风险" value={draft.risk} options={riskOptions} downArrow onValueChange={(risk) => change({risk: risk as InventoryFilters["risk"]})} /></FilterSection>
    </div>
    {source && <Select key={source} searchable hidePhoneTrigger phoneOpenRequest={1} phoneDialogTitle={`选择${sourceLabels[source]}`} aria-label={`选择${sourceLabels[source]}`} searchPlaceholder={`搜索${sourceLabels[source]}`} value={draft[source]} selectedOption={{value: draft[source], label: draft[source] || sourceAllLabels[source]}} options={sourceOptions} shouldFilter={source === "brand"} searchLoading={source === "brand" ? brandCatalog.isLoading : debouncedSearch !== search || suggestions.isPending} onSearchValueChange={setSearch} onValueChange={(value) => change({[source]: value})} onPhoneOpenChange={(next) => {if (!next) {setSource(null); setSearch("");}}} />}
  </ErpDialogShell>;
}

function FilterSection({title, children}: {title: string; children: ReactNode}) {
  return <section className="erp-inventory-filter-section"><h3>{title}</h3>{children}</section>;
}

function InventorySelectRow({label, value, options, onValueChange, downArrow}: {label: string; value: string; options: readonly SelectOption[]; onValueChange: (value: string) => void; downArrow?: boolean}) {
  return <Select aria-label={label} value={value} options={options} onValueChange={onValueChange} className={downArrow ? "erp-inventory-filter-select" : "erp-inventory-filter-select erp-inventory-filter-select-next"} renderValue={(option) => <span className="erp-inventory-filter-select-value"><span>{label}</span><span>{option?.label}</span></span>} />;
}
