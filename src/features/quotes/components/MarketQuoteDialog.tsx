import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect, useState} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDatePicker, ErpDialogShell, ErpField, ErpFormSection, ErpPageError} from "@/src/components/common";
import type {MarketQuoteCategory, MarketQuoteFormValues, MarketQuoteItem, QuoteProductOption} from "@/src/types/quote";
import {coreQuoteProfile, gpuCoreIdentity} from "@/src/utils/quoteReference";
import {GpuCorePicker} from "@/src/components/domain/GpuCorePicker";
import {GpuCatalogEditor, GpuCatalogEditorFooter, type GpuCatalogEdit} from "@/src/components/domain/GpuCatalogEditor";
import {useGpuCoreCatalog} from "@/src/hooks/useGpuCoreCatalog";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import type {GpuCoreRecord} from "@/src/types/gpuCore";
import {defaultMarketQuoteValues, marketQuoteSchema} from "../quote.schema";
import {quoteNeedsConfirmation} from "../quote.reference";

export function MarketQuoteDialog({open, quote, categories, pending, error, onOpenChange, onSubmit}: {open: boolean; quote: MarketQuoteItem | null; categories: MarketQuoteCategory[]; products?: QuoteProductOption[]; quotes?: MarketQuoteItem[]; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: MarketQuoteFormValues) => Promise<void>}) {
  const form = useForm<MarketQuoteFormValues>({resolver: zodResolver(marketQuoteSchema), defaultValues: defaultMarketQuoteValues});
  const [conversionConfirmed, setConversionConfirmed] = useState(false);
  const catalog = useGpuCoreCatalog(open);
  const [catalogEdit, setCatalogEdit] = useState<GpuCatalogEdit | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  usePhoneBackLayer(Boolean(open && catalogEdit), () => {if (!catalogBusy) setCatalogEdit(null);}, 600);
  const requiresConversion = Boolean(quote && quoteNeedsConfirmation(quote));
  useEffect(() => {
    setConversionConfirmed(false);
    setCatalogEdit(null);
    const core = quote && gpuCoreIdentity(quote.coreModel || quote.model);
    form.reset(quote ? {...defaultMarketQuoteValues, model: core?.coreModel || quote.model, brand: core?.vendor || quote.brand, coreId: core?.coreId || "", coreModel: core?.coreModel || quote.model, categoryId: quote.categoryId || "", source: quote.source || "", validUntil: quote.validUntil || "", buyPrice: quote.buyPrice ?? null, sellPrice: quote.sellPrice ?? null, trend: quote.trend, note: quote.note || ""} : defaultMarketQuoteValues);
  }, [form, open, quote]);
  const coreModel = form.watch("coreModel") || "";
  const core = gpuCoreIdentity(coreModel);
  const identityLocked = pending || Boolean(quote && (!requiresConversion || !conversionConfirmed));
  const fieldError = (name: keyof MarketQuoteFormValues) => form.formState.errors[name]?.message;
  const selectCore = (value: string) => {
    const identity = gpuCoreIdentity(value);
    form.setValue("coreModel", identity?.coreModel || value, {shouldDirty: true});
    form.setValue("coreId", identity?.coreId || "", {shouldDirty: true});
    form.setValue("model", identity?.coreModel || value, {shouldDirty: true});
    form.setValue("brand", identity?.vendor || "NVIDIA", {shouldDirty: true});
  };
  const catalogSaved = async (saved: GpuCoreRecord) => {
    selectCore(saved.model); setCatalogEdit(null);
  };
  return <ErpDialogShell open={open} onOpenChange={(next) => {if (!next && catalogEdit) {if (!catalogBusy) setCatalogEdit(null);} else onOpenChange(next);}} pending={pending || catalogBusy} size="lg" mobilePresentation="fullscreen" title={catalogEdit ? "新建 GPU 核心" : quote ? "更新核心基础价" : "新增核心基础价"} description={catalogEdit ? "保存后返回报价表单，原有填写内容保留。" : "每个完整核心型号只维护一套回收与销售基础价。不改写库存价格；留空表示暂无报价，0 是有效价格。"} footer={catalogEdit ? <GpuCatalogEditorFooter formId="quote-gpu-catalog-form" busy={catalogBusy} onCancel={() => setCatalogEdit(null)} /> : <><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" form="market-quote-form" variant="primary" disabled={requiresConversion && !conversionConfirmed} loading={pending}>{quote ? "保存更新" : "创建基础价"}</Button></>}>
    {catalogEdit ? <GpuCatalogEditor edit={catalogEdit} formId="quote-gpu-catalog-form" onSaved={catalogSaved} onBusy={setCatalogBusy} createCore={catalog.createCore} addSpec={catalog.addSpec} /> : <form id="market-quote-form" onSubmit={(event) => {void form.handleSubmit(async (values) => {if (requiresConversion && !conversionConfirmed) return; await onSubmit(values);})(event);}} className="space-y-4">
      {error && <ErpPageError title="保存失败" description={error} />}
      {requiresConversion && <div className="space-y-2 text-sm text-[var(--erp-color-warning)]"><p>{conversionConfirmed ? "保存后明确转换为核心基础价，清除原商品关联；原历史保留为历史待确认，不参与新趋势。" : "历史报价待确认，不能继续维护原报价。请确认转换为完整核心型号的一套基础价。"}</p><Button type="button" variant="secondary" disabled={pending} onClick={() => {setConversionConfirmed(!conversionConfirmed); form.setValue("quoteScope", "core"); form.setValue("profile", coreQuoteProfile()); form.setValue("productId", "");}}>{conversionConfirmed ? "取消转换" : "确认转换为核心基础价"}</Button></div>}
      {catalog.isError && <ErpPageError title="暂时无法读取核心目录" description="请稍后重试；已有报价不会因此改变。" onRetry={() => {void catalog.refetch();}} />}
      <ErpFormSection title="核心基础价" description={quote && !requiresConversion ? "核心型号已锁定；同一核心仅维护一套基础价。" : "选择完整核心型号；基础参考价不区分显存规格差价。"}>
        <div className="grid gap-4 md:grid-cols-2">
          <ErpField label="GPU 核心型号" required error={fieldError("coreModel")} className="md:col-span-2">{identityLocked ? <Input readOnly value={core?.coreModel || coreModel} /> : <GpuCorePicker cores={catalog.data?.cores || []} value={core?.coreId || ""} loading={catalog.isLoading} disabled={pending} canCreate={catalog.data?.canManage === true} onSelect={selected => selectCore(selected?.model || "")} onCreate={initialModel => setCatalogEdit({kind: "core", initialModel, requireSpec: false})} />}</ErpField>
          <ErpField label="核心映射" hint="只读预览，不保存到商品。" className="md:col-span-2"><Input readOnly value={core?.coreId || "待确认：请输入完整核心型号"} /></ErpField>
          <ErpField label="回收参考价" error={fieldError("buyPrice")}><Controller control={form.control} name="buyPrice" render={({field}) => <ErpAmountInput value={field.value ?? ""} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue ?? null)} disabled={pending || requiresConversion && !conversionConfirmed} placeholder="暂无报价" />} /></ErpField>
          <ErpField label="销售参考价" error={fieldError("sellPrice")}><Controller control={form.control} name="sellPrice" render={({field}) => <ErpAmountInput value={field.value ?? ""} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue ?? null)} disabled={pending || requiresConversion && !conversionConfirmed} placeholder="暂无报价" />} /></ErpField>
          <ErpField label="有效期至" error={fieldError("validUntil")} hint="留空表示不设截止日期。"><Controller control={form.control} name="validUntil" render={({field}) => <ErpDatePicker value={field.value || ""} onChange={field.onChange} clearable disabled={pending || requiresConversion && !conversionConfirmed} aria-label="有效期至" />} /></ErpField>
          <ErpField label="行情分类" error={fieldError("categoryId")}><Controller control={form.control} name="categoryId" render={({field}) => <Select value={field.value} onValueChange={field.onChange} disabled={pending || requiresConversion && !conversionConfirmed} aria-label="行情分类" searchable={categories.length > 12} options={[{value: "", label: "未分类"}, ...categories.filter((category) => category.isActive || category.id === quote?.categoryId).map((category) => ({value: category.id, label: category.name + (category.isActive ? "" : "（已停用）"), disabled: !category.isActive}))]} />} /></ErpField>
          <ErpField label="说明" error={fieldError("note")} className="md:col-span-2"><Textarea {...form.register("note")} disabled={pending || requiresConversion && !conversionConfirmed} placeholder="补充注意事项（选填）" /></ErpField>
        </div>
      </ErpFormSection>
    </form>}
  </ErpDialogShell>;
}
