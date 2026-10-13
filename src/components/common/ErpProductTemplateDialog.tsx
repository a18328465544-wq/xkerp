import {zodResolver} from "@hookform/resolvers/zod";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Controller, useForm} from "react-hook-form";
import {Sparkles} from "lucide-react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {GpuCorePicker} from "@/src/components/domain/GpuCorePicker";
import {GpuCatalogEditor, GpuCatalogEditorFooter, type GpuCatalogEdit} from "@/src/components/domain/GpuCatalogEditor";
import {useGpuCoreCatalog} from "@/src/hooks/useGpuCoreCatalog";
import {useProductBrandCatalog} from "@/src/hooks/useProductBrandCatalog";
import {ProductBrandPicker} from "@/src/components/domain/ProductBrandPicker";
import {ProductBrandEditor} from "@/src/components/domain/ProductBrandEditor";
import {resolveProductBrand} from "@/src/utils/productBrandCatalog";
import type {GpuCoreRecord, GpuMemorySpec} from "@/src/types/gpuCore";
import {gpuSpecLabel, inferGpuProductBinding} from "@/src/utils/gpuCoreCatalog";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {ErpAmountInput} from "./ErpAmountInput";
import {ErpChoiceChips} from "./ErpChoiceChips";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpField} from "./ErpField";
import {ErpImagePreviewDialog} from "./ErpImagePreviewDialog";
import {ErpUploader} from "./ErpUploader";
import type {ProductCategory} from "@/src/types/core";
import type {ProductLibraryItem, ProductTemplateFormValues} from "@/src/types/product";
import {buildProductTemplateName} from "@/src/lib/productName";
import {productCategoryValues, productTemplateSchema} from "./productTemplateSchema";
import {getProductTemplateFields, type ProductTemplateFieldKey} from "./productTemplateFieldConfig";
import {useProductMediaUpload} from "./useProductMediaUpload";
import {useValidatedFormSubmit} from "./useValidatedFormSubmit";

const emptyValues: ProductTemplateFormValues = {category: "显卡", brand: "", model: "", version: "", vram: "", refBuyPrice: 0, refSellPrice: 0, remarks: "", imageUrls: []};
const textFieldKeys: readonly ProductTemplateFieldKey[] = ["brand", "model", "version", "vram"];

function valuesFromProduct(product: ProductLibraryItem | null, initialValues?: Partial<ProductTemplateFormValues>): ProductTemplateFormValues {
  const base = product ? {category: product.category, brand: product.brand, model: product.model, version: product.version === "-" ? "" : product.version, vram: product.vram === "-" ? "" : product.vram, refBuyPrice: product.refBuyPrice || 0, refSellPrice: product.refSellPrice || 0, remarks: product.remarks || "", imageUrls: product.imageUrls} : {...emptyValues, imageUrls: []};
  return {...base, brandId: product?.brandId, gpuCoreId: product?.gpuCoreId, gpuSpecId: product?.gpuSpecId, ...initialValues, imageUrls: initialValues?.imageUrls ?? base.imageUrls};
}

export interface ErpProductTemplateDialogProps {
  open: boolean;
  product: ProductLibraryItem | null;
  /** Optional values used by a caller such as a search-to-create flow. */
  initialValues?: Partial<ProductTemplateFormValues>;
  showCost: boolean;
  showProfit: boolean;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductTemplateFormValues) => Promise<void>;
}

/**
 * The single Product Library template editor for create and edit flows.
 * Feature pages own only the mutation and post-submit behavior; fields,
 * validation, media handling and permission presentation stay here.
 */
export function ErpProductTemplateDialog({open, product, initialValues, showCost, showProfit, pending, error, onOpenChange, onSubmit}: ErpProductTemplateDialogProps) {
  const form = useForm<ProductTemplateFormValues>({defaultValues: emptyValues, resolver: zodResolver(productTemplateSchema), mode: "onBlur"});
  const {control, register, reset, setValue, watch, formState} = form;
  const setImageUrls = (urls: string[]) => setValue("imageUrls", urls, {shouldDirty: true, shouldValidate: true});
  const media = useProductMediaUpload(setImageUrls, 6, open, pending);
  const submission = useValidatedFormSubmit({form, enabled: open, scope: media.draftId, getScope: media.getDraftId, canSubmit: () => !pending && !media.isBlocking(), onSubmit: async (submitted) => {
    const chosenBrand = submitted.brandId ? brands.find(brand => brand.id === submitted.brandId) : resolveProductBrand(submitted.brand, brands);
    if (!product && !chosenBrand) {form.setError("brand", {message: "请选择品牌，找不到时请先新建"}); return;}
    if (!product && submitted.category === "显卡" && (!submitted.gpuCoreId || !submitted.gpuSpecId)) {
      if (!submitted.gpuCoreId) form.setError("model", {message: "请选择核心型号"});
      if (!submitted.gpuSpecId) form.setError("vram", {message: "请选择该核心的显存规格"});
      return;
    }
    await onSubmit(chosenBrand ? {...submitted, brandId: chosenBrand.id, brand: chosenBrand.name} : submitted);
  }});
  const [previewUrl, setPreviewUrl] = useState<string>();
  const values = watch();
  const brandCatalog = useProductBrandCatalog(open);
  const brands = brandCatalog.data?.brands || [];
  const selectedBrand = brands.find(brand => brand.id === values.brandId) || resolveProductBrand(values.brand, brands);
  const [brandEdit, setBrandEdit] = useState<string | null>(null);
  const selectBrand = (brand: import("@/src/types/productBrand").ProductBrandRecord | null) => {
    setValue("brandId", brand?.id, {shouldDirty: true});
    setValue("brand", brand?.name || "", {shouldDirty: true, shouldValidate: true});
  };
  const catalog = useGpuCoreCatalog(open && values.category === "显卡");
  const [catalogEdit, setCatalogEdit] = useState<GpuCatalogEdit | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const cores = catalog.data?.cores || [];
  const inferred = inferGpuProductBinding(values, cores);
  const selectedCore = cores.find(core => core.id === values.gpuCoreId) || ("core" in inferred ? inferred.core : undefined);
  const selectSpec = (core: GpuCoreRecord, spec: GpuMemorySpec | undefined) => {
    setValue("gpuCoreId", core.id, {shouldDirty: true});
    setValue("model", core.model, {shouldDirty: true, shouldValidate: true});
    setValue("gpuSpecId", spec?.id || "", {shouldDirty: true});
    setValue("vram", spec ? gpuSpecLabel(spec) : "", {shouldDirty: true, shouldValidate: true});
  };
  const selectCore = (core: GpuCoreRecord | null) => {
    if (core) selectSpec(core, core.specs.length === 1 ? core.specs[0] : undefined);
    else {setValue("gpuCoreId", "", {shouldDirty: true}); setValue("gpuSpecId", "", {shouldDirty: true}); setValue("model", "", {shouldDirty: true}); setValue("vram", "", {shouldDirty: true});}
  };
  usePhoneBackLayer(Boolean(open && (catalogEdit || brandEdit !== null)), () => {if (!catalogBusy) {setCatalogEdit(null); setBrandEdit(null);}}, 600);
  const catalogSaved = async (saved: GpuCoreRecord) => {
    const specId = saved.specs.at(-1)?.id;
    selectSpec(saved, saved.specs.find(spec => spec.id === specId));
    setCatalogEdit(null);
  };
  const fieldDefinitions = useMemo(() => getProductTemplateFields(values.category), [values.category]);
  const previewName = useMemo(() => {
    const brand = values.brand.trim();
    const model = values.model.trim();
    if (!brand || !model) return "填写品牌、型号等核心信息后自动生成";
    return buildProductTemplateName(brand, model, values.version || "", values.vram || "");
  }, [values.brand, values.model, values.version, values.vram]);

  useEffect(() => {
    if (!open) {media.reset([]); setPreviewUrl(undefined); setCatalogEdit(null); setBrandEdit(null); return;}
    const next = valuesFromProduct(product, initialValues);
    reset(next);
    media.reset(next.imageUrls);
    setPreviewUrl(undefined);
  }, [initialValues, open, product, reset, media.reset]);

  const message = (field: keyof ProductTemplateFormValues) => formState.errors[field]?.message ? String(formState.errors[field]?.message) : undefined;
  const handleCategoryChange = (nextCategory: ProductCategory, onChange: (value: ProductCategory) => void) => {
    onChange(nextCategory);
    if (nextCategory !== "显卡") {setValue("gpuCoreId", undefined, {shouldDirty: true}); setValue("gpuSpecId", undefined, {shouldDirty: true});}
    const visible = new Set(getProductTemplateFields(nextCategory).map((definition) => definition.key));
    textFieldKeys.forEach((key) => {
      if (!visible.has(key)) setValue(key, "", {shouldDirty: true, shouldValidate: true});
    });
  };

  const formId = "product-template-form";
  return <>
    <ErpDialogShell
      open={open}
      onOpenChange={(next) => {if (!next && (catalogEdit || brandEdit !== null)) {if (!catalogBusy) {setCatalogEdit(null); setBrandEdit(null);}} else onOpenChange(next);}}
      pending={pending || catalogBusy}
      size="xl"
      title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--erp-color-primary)]" />{brandEdit !== null ? "新建商品品牌" : catalogEdit ? catalogEdit.kind === "core" ? "新建 GPU 核心" : "新增显存规格" : product ? "编辑商品规格模板" : "新建商品规格模板"}</span>}
      description={catalogEdit || brandEdit !== null ? "保存后返回商品表单，原有填写内容保留。" : "用于采购、销售、检测和库存共用；标准名称由核心字段自动生成。"}
      footer={brandEdit !== null ? <GpuCatalogEditorFooter formId="product-brand-form" busy={catalogBusy} onCancel={() => setBrandEdit(null)} /> : catalogEdit ? <GpuCatalogEditorFooter formId="product-gpu-catalog-form" busy={catalogBusy} onCancel={() => setCatalogEdit(null)} /> : <><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending || media.blocking || submission.validating}>{pending ? "保存中…" : submission.validating ? "校验中…" : media.blocking ? "等待图片处理" : product ? "保存修改" : "保存模板"}</Button></>}
    >
      {brandEdit !== null ? <ProductBrandEditor initialName={brandEdit} formId="product-brand-form" onBusy={setCatalogBusy} createBrand={brandCatalog.createBrand} onSaved={saved => {selectBrand(saved); setBrandEdit(null);}} /> : catalogEdit ? <GpuCatalogEditor edit={catalogEdit} formId="product-gpu-catalog-form" onSaved={catalogSaved} onBusy={setCatalogBusy} createCore={catalog.createCore} addSpec={catalog.addSpec} /> : <form id={formId} onSubmit={submission.onSubmit} className="space-y-4">
        <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/45 p-3 sm:p-4" aria-labelledby="product-category-title">
          <div className="mb-2 flex items-center justify-between gap-3"><h2 id="product-category-title" className="text-sm font-semibold text-[var(--erp-color-text)]">商品分类</h2><span className="text-xs text-[var(--erp-color-text-muted)]">当前：{values.category}</span></div>
          <Controller control={control} name="category" render={({field}) => <ErpChoiceChips label="商品品类" value={field.value} options={productCategoryValues.map((category) => ({value: category, label: category}))} disabled={pending} onValueChange={(category) => handleCategoryChange(category, field.onChange)} />} />
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" aria-labelledby="product-basic-title">
            <div className="mb-4"><h2 id="product-basic-title" className="text-sm font-semibold text-[var(--erp-color-text)]">基本信息</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">填写可识别商品身份的核心字段。</p></div>
            <div className="grid gap-3 sm:grid-cols-2">{fieldDefinitions.map((definition, index) => <Field key={definition.key} label={values.category === "显卡" && definition.key === "vram" ? "显存规格" : definition.label} required={definition.required || values.category === "显卡" && definition.key === "vram"} error={message(definition.key)}>
              {definition.key === "brand" ? <ProductBrandPicker brands={brands} value={selectedBrand?.id || ""} legacyValue={values.brand} loading={brandCatalog.isLoading} disabled={pending} canCreate={brandCatalog.data?.canManage} onSelect={selectBrand} onCreate={setBrandEdit} /> : values.category === "显卡" && definition.key === "model" ? <GpuCorePicker cores={cores} value={selectedCore?.id || ""} loading={catalog.isLoading} disabled={pending} canCreate={catalog.data?.canManage === true} onSelect={selectCore} onCreate={initialModel => setCatalogEdit({kind: "core", initialModel, requireSpec: true})} /> : values.category === "显卡" && definition.key === "vram" ? <div className="space-y-1"><Select aria-label="显存规格" value={values.gpuSpecId || ""} disabled={pending || !selectedCore} placeholder={selectedCore ? "选择该核心的显存规格" : "先选择 GPU 核心"} options={(selectedCore?.specs || []).map(spec => ({value: spec.id, label: gpuSpecLabel(spec)}))} onValueChange={id => {if (selectedCore) selectSpec(selectedCore, selectedCore.specs.find(spec => spec.id === id));}} />{selectedCore && catalog.data?.canManage && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setCatalogEdit({kind: "spec", core: selectedCore})}>为此核心新增非标准规格</Button>}</div> : <Input {...register(definition.key)} placeholder={definition.placeholder} disabled={pending} autoFocus={index === 0} />}
            </Field>)}</div>
            {brandCatalog.isError && <p role="alert" className="text-sm text-[var(--erp-color-danger)]">暂时无法读取品牌，请稍后重试。<Button type="button" variant="ghost" size="sm" onClick={() => {void brandCatalog.refetch();}}>重试</Button></p>}
            {product && !product.brandId && <p className="mt-2 text-xs text-[var(--erp-color-text-secondary)]">原品牌：{product.brand}。{selectedBrand ? `保存时使用统一品牌“${selectedBrand.name}”。` : "尚未确认品牌，可保留原值或重新选择。"}</p>}
            {values.category === "显卡" && catalog.isError && <p role="alert" className="text-sm text-[var(--erp-color-danger)]">暂时无法读取核心目录，请稍后重试。<Button type="button" variant="ghost" size="sm" onClick={() => {void catalog.refetch();}}>重试</Button></p>}
            {product && values.category === "显卡" && !values.gpuSpecId && <div className="mt-3 space-y-1 text-xs text-[var(--erp-color-text-secondary)]"><p>原型号：{product.model}；原显存：{product.vram}。尚未确认标准规格，不会自动改写。</p>{inferred.status === "matched" && <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => selectSpec(inferred.core, inferred.spec)}>确认绑定识别建议</Button>}</div>}
            <div className="mt-4 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3" aria-live="polite"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">标准商品名称</p><span className="text-xs text-[var(--erp-color-text-muted)]">系统生成预览</span></div><p className={`mt-1 truncate text-sm font-semibold ${previewName.startsWith("填写") ? "text-[var(--erp-color-text-muted)]" : "text-[var(--erp-color-text)]"}`} title={previewName}>{previewName}</p></div>
          </section>

          <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" aria-labelledby="product-supplement-title">
            <div className="mb-4"><h2 id="product-supplement-title" className="text-sm font-semibold text-[var(--erp-color-text)]">补充信息</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">价格和备注为可选信息。</p></div>
            <div className="space-y-3">
              {showCost ? <Field label="建议回收买入价" error={message("refBuyPrice")}><Controller control={control} name="refBuyPrice" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(detail) => field.onChange(detail.floatValue || 0)} disabled={pending} aria-label="建议回收买入价" />} /></Field> : <PermissionNotice>当前账号无参考成本查看权限，该字段按 0 提交。</PermissionNotice>}
              {showProfit ? <Field label="建议销售卖出价" error={message("refSellPrice")}><Controller control={control} name="refSellPrice" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(detail) => field.onChange(detail.floatValue || 0)} disabled={pending} aria-label="建议销售卖出价" />} /></Field> : <PermissionNotice>当前账号无参考利润查看权限，该字段按 0 提交。</PermissionNotice>}
              <Field label="备注"><Textarea {...register("remarks")} className="min-h-24" maxLength={300} placeholder="补充回收、质检或包装提示" disabled={pending} /></Field>
            </div>
          </section>
        </div>

        <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" aria-labelledby="product-images-title">
          <div className="mb-3"><h2 id="product-images-title" className="text-sm font-semibold text-[var(--erp-color-text)]">商品图片</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">可选，最多 6 张；支持 JPG、PNG、WEBP。</p></div>
          <ErpUploader items={media.items} maxCount={6} accept={media.accept} disabled={pending} showHeading={false} compact description="外观、包装和规格图片" uploadedDescription="图片已上传，等待随商品模板保存" footerDescription={`已选择 ${media.items.length} / 6 张；图片会在上传前压缩到约 100KB。`} error={media.error} onFilesSelected={media.addFiles} onRetry={media.retry} onRemove={media.remove} onPreview={(item) => setPreviewUrl(item.previewUrl)} />
        </section>
        {(submission.feedback || error) && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{submission.feedback || error}</p>}
      </form>}
    </ErpDialogShell>
    <ErpImagePreviewDialog open={Boolean(previewUrl)} src={previewUrl} alt="商品图片预览" title="商品图片预览" onOpenChange={(next) => {if (!next) setPreviewUrl(undefined);}} />
  </>;
}

function Field({label, required = false, error, children}: {label: string; required?: boolean; error?: string; children: ReactNode}) {
  return <ErpField label={label} required={required} error={error}>{children}</ErpField>;
}

function PermissionNotice({children}: {children: ReactNode}) {
  return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-warning)]">{children}</div>;
}
