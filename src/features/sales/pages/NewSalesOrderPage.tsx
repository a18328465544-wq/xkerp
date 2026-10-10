import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {Check, Loader2, RefreshCw} from "lucide-react";
import {useEffect, useMemo, useRef, useState} from "react";
import {useFieldArray, useForm, useWatch, type FieldPath} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Input, Switch, Textarea} from "@/src/components/ui";
import {CustomerPicker} from "@/src/components/domain";
import {ErpFormSection, ErpLoadingState, ErpPageContent, ErpPageError, ErpPartnerQuickCreateDialog, ErpStatusBadge, ErpSubmitBar, ErpTransactionColumns, ErpTransactionPageFrame, ErpTransactionPrimary, ErpTransactionSecondary} from "@/src/components/common";
import {ApiError, createIdempotencyKey, partnersApi, queryKeys, refreshErpAfterDocument, salesApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {SalesChannel, SalesCustomerOption, SalesFormValues, SalesInventoryCandidate, SalesProductCandidate} from "@/src/types/sales";
import type {VoiceParseResult, VoiceSalesLineDraft} from "@/src/types/voice";
import type {PartnerQuickCreateValues} from "@/src/lib/partnerQuickCreate";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {createSalesDefaults, createSalesLineDefaults} from "@/src/features/sales/sales.defaults";
import {calculateSalesAmounts} from "@/src/features/sales/sales.calculations";
import {salesOrderSchema} from "@/src/features/sales/sales.schema";
import {SalesAmountSummary} from "@/src/features/sales/components/SalesAmountSummary";
import {SalesLineItemsTable} from "@/src/features/sales/components/SalesLineItemsTable";
import {SalesPaymentSection} from "@/src/features/sales/components/SalesPaymentSection";
import {salesFieldErrors, salesFormValidationMessage, salesSubmitErrorMessage} from "@/src/features/sales/sales.errors";
import {useValidatedFormSubmit} from "@/src/components/common/useValidatedFormSubmit";
import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import {useWorkspaceTabDirty} from "@/src/hooks/useWorkspaceTabRuntime";
import {ErpMobileWorkflow, ErpMobileWorkflowSection, ErpMobileWorkflowDesktop, ErpMobileWorkflowPhone, ErpTransactionHeader} from "@/src/components/common";
import {hasWorkflowErrors, workflowBlockedReason} from "@/src/components/common/mobileWorkflowValidation";
import type {PaymentEntryFeedback} from "@/src/lib/paymentEntry";
import {ErpMobileWorkflowEditButton} from "@/src/components/common/ErpMobileWorkflow";
import {formatCurrency} from "@/src/lib/format";
import {VoiceEntryControl} from "@/src/app/voice/VoiceEntryControl";
import {useVoiceDraftHandoff} from "@/src/app/voice/useVoiceDraftHandoff";
import {VoiceHandoffConflictDialog} from "@/src/app/voice/VoiceHandoffConflictDialog";
import {applySalesVoiceDraftToForm, type SalesVoiceLineSelection} from "@/src/features/sales/sales.voice-draft";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const salesChannels: SalesChannel[] = ["到店", "闲鱼", "抖音", "小红书", "B站", "微信私域", "同行网店"];

type SalesOrderDraft = {
  values: SalesFormValues;
  selectedCustomer: SalesCustomerOption | null;
  selectedCandidatesByIndex?: Array<SalesProductCandidate | null>;
};

type VoiceSalesLineReview = {
  draft: VoiceSalesLineDraft;
  products: SalesProductCandidate[];
  cards: SalesInventoryCandidate[];
  selectedInventoryId?: string;
  autoSelected?: boolean;
  loading: boolean;
  error?: string;
};

type VoiceSalesReview = {
  parseId: string;
  customerQuery: string;
  customerContact: string;
  lines: VoiceSalesLineReview[];
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function customerQuickCreateError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "当前账号没有新建客户权限，销售单其他内容已保留。";
    if (error.status === 409) return error.message || "客户档案已存在，请搜索后选择。";
    if (error.status === 400) return error.message || "请检查客户必填信息。";
    if (error.status === 401) return "登录状态已失效，请重新登录后再新建客户。";
    return error.message || "新建客户失败，请稍后重试。";
  }
  return error instanceof Error ? error.message : "新建客户失败，请稍后重试。";
}

export function NewSalesOrderPage() {
  const {session, logout} = useAuth();
  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的销售开单权限。" /></Card>;
  if (!createCapabilities(session).menu("sales_add")) return <ErpPageError title="当前账号没有销售开单权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  return <SalesOrderForm session={session} onAuthExpired={logout} />;
}

function SalesOrderForm({session, onAuthExpired}: {session: AuthSession; onAuthExpired: () => void}) {
  const {active} = useWorkspaceTabActivity();
  const {handoff, setHandoff} = useVoiceDraftHandoff("sales", active);
  const handledHandoffId = useRef("");
  const [handoffConflictOpen, setHandoffConflictOpen] = useState(false);
  const [globalVoiceDraft, setGlobalVoiceDraft] = useState<{result: VoiceParseResult; transcript: string} | null>(null);
  const [settlementEntry, setSettlementEntry] = useState<PaymentEntryFeedback>({ready: true});
  const queryClient = useQueryClient();
  const operatorName = session.user.displayName.trim() || session.user.username;
  const permissions = session.permissions || permissionDefaults;
  const allowedMenus = permissions.allowedMenus;
  const hasAllPermissions = allowedMenus.includes("all");
  // The sales picker reads the canonical customer archive and is part of the
  // sales_add workflow. CRM menu access is not a prerequisite for order entry.
  const canReadCustomers = hasAllPermissions || allowedMenus.includes("sales_add");
  const canCreateCustomer = hasAllPermissions || allowedMenus.includes("customers");
  const canReadInventory = hasAllPermissions || allowedMenus.includes("inventory");
  const canReadSettlementAccounts = hasAllPermissions || allowedMenus.includes("settlement_accounts");
  const showCost = permissions.showCost;
  const defaultValues = useMemo(() => createSalesDefaults(operatorName), [operatorName]);
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<SalesOrderDraft>("sales_add");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const form = useForm<SalesFormValues>({defaultValues: restoredDraft?.values || defaultValues, mode: "onBlur", resolver: zodResolver(salesOrderSchema)});
  const {control, register, setValue, setError, clearErrors, reset, getValues, formState} = form;
  const {fields, append, remove} = useFieldArray({control, name: "items"});
  const watchedValues = useWatch({control});
  const values = watchedValues as SalesFormValues;
  const validation = useMemo(() => salesOrderSchema.safeParse(values), [values]);
  const canSubmit = validation.success && settlementEntry.ready;
  const issues = validation.success ? [] : validation.error.issues;
  const amounts = useMemo(() => calculateSalesAmounts({items: values.items || [], paidAmount: values.paidAmount || 0}, showCost && permissions.showProfit), [permissions.showProfit, showCost, values.items, values.paidAmount]);
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomerOption | null>(() => restoredDraft?.selectedCustomer || null);
  const [recentCustomerIds, setRecentCustomerIds] = useState<string[]>([]);
  const [customerCreate, setCustomerCreate] = useState<{initialName: string; initialContact: string; origin: "form" | "voice"} | null>(null);
  const [voiceReview, setVoiceReview] = useState<VoiceSalesReview | null>(null);
  const [voiceCustomerKeyword, setVoiceCustomerKeyword] = useState("");
  const [voiceSelectedCustomer, setVoiceSelectedCustomer] = useState<SalesCustomerOption | null>(null);
  const [voiceCustomerLookupError, setVoiceCustomerLookupError] = useState<string | null>(null);
  const [paymentResetVersion, setPaymentResetVersion] = useState(0);
  const [pendingVoiceCandidateAssignments, setPendingVoiceCandidateAssignments] = useState<Array<{index: number; candidate: SalesProductCandidate}>>([]);
  const autoCreateVoiceParseId = useRef("");
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, SalesProductCandidate | null>>(() => Object.fromEntries(fields.map((field, index) => [field.id, restoredDraft?.selectedCandidatesByIndex?.[index] || null])) as Record<string, SalesProductCandidate | null>);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [inventoryKeywords, setInventoryKeywords] = useState<Record<string, string>>({});
  const [activeInventoryFieldId, setActiveInventoryFieldId] = useState<string | null>(null);
  const debouncedCustomerKeyword = useDebouncedValue(customerKeyword);
  const debouncedVoiceCustomerKeyword = useDebouncedValue(voiceCustomerKeyword);
  const activeInventoryKeyword = activeInventoryFieldId ? inventoryKeywords[activeInventoryFieldId] || "" : "";
  const debouncedInventoryKeyword = useDebouncedValue(activeInventoryKeyword);
  const customerQuery = useQuery({queryKey: queryKeys.sales.customers(debouncedCustomerKeyword), queryFn: ({signal}) => salesApi.searchCustomers(debouncedCustomerKeyword, signal), enabled: active && (Boolean(session) && canReadCustomers), retry: false, staleTime: 30_000});
  const voiceCustomerQuery = useQuery({queryKey: queryKeys.sales.customers(debouncedVoiceCustomerKeyword), queryFn: ({signal}) => salesApi.searchCustomers(debouncedVoiceCustomerKeyword, signal), enabled: active && Boolean(voiceReview) && canReadCustomers && Boolean(debouncedVoiceCustomerKeyword.trim()), retry: false, staleTime: 30_000});
  const inventoryQuery = useQuery({queryKey: queryKeys.sales.productCandidates(debouncedInventoryKeyword), queryFn: ({signal}) => salesApi.searchProductCandidates(debouncedInventoryKeyword, {showCost, showProfit: permissions.showProfit}, signal), enabled: active && (Boolean(session) && canReadInventory && Boolean(activeInventoryFieldId)), retry: false, staleTime: 15_000});
  const accountQuery = useQuery({queryKey: queryKeys.sales.settlementAccounts(), queryFn: ({signal}) => salesApi.settlementAccounts(signal), enabled: active && (Boolean(session) && canReadSettlementAccounts), retry: false, staleTime: 30_000});
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const editorScope = useRef(createIdempotencyKey("sales-editor"));
  const submissionIdentity = useRef(createSubmissionIdentity("sales-create"));
  const isDirty = formState.isDirty || restoredDraftActive;
  useWorkspaceTabDirty("sales_add", isDirty);
  // 录单页使用实时工作区草稿，离开或切换时不拦截；回到标签页即可继续录入。
  useEffect(() => {
    const persist = () => {
      if (!formState.isDirty && !restoredDraftActive) {
        discardDraft();
        return;
      }
      saveDraft({values: form.getValues(), selectedCustomer, selectedCandidatesByIndex: fields.map((field) => selectedCandidates[field.id] || null)});
    };
    persist();
    const subscription = form.watch(persist);
    return () => subscription.unsubscribe();
  }, [discardDraft, fields, form, formState.isDirty, restoredDraftActive, saveDraft, selectedCandidates, selectedCustomer]);
  const createMutation = useMutation({mutationFn: (payload: {values: SalesFormValues}) => {
    const account = accountQuery.data?.find((item) => item.id === payload.values.settlementAccountId);
    return salesApi.create(payload.values, account, undefined, submissionIdentity.current);
  }});
  const customerCreateMutation = useMutation({mutationFn: (values: PartnerQuickCreateValues) => partnersApi.createCustomer({name: values.name, contact: values.contact, channel: values.channel, remarks: values.remarks})});

  const handleSelectCustomer = (option: SalesCustomerOption) => {
    if (!option.selectable) return;
    setRecentCustomerIds((current) => [option.id, ...current.filter((id) => id !== option.id)].slice(0, 5));
    setSelectedCustomer(option);
    setValue("customerId", option.id, {shouldDirty: true, shouldValidate: true});
    setValue("customerPartnerType", option.partnerType, {shouldDirty: true, shouldValidate: true});
    setValue("customerName", option.name, {shouldDirty: true, shouldValidate: true});
    setValue("contact", option.contact, {shouldDirty: true});
    const inferredChannel = option.partnerType === "vendor" ? "同行网店" : salesChannels.find((channel) => channel === option.source);
    if (inferredChannel) setValue("channel", inferredChannel, {shouldDirty: true, shouldValidate: true});
    clearErrors(["customerId", "customerName"]);
  };
  const handleCreatedCustomer = (option: SalesCustomerOption) => {
    if (customerCreate?.origin === "voice") setVoiceSelectedCustomer(option);
    handleSelectCustomer(option);
    setCustomerCreate(null);
    setCustomerKeyword("");
    notify.success("客户已新建并选中", {description: "销售单其他内容保持不变。"});
    void queryClient.invalidateQueries({queryKey: queryKeys.sales.all()});
  };
  const openCustomerCreate = (initialName: string, origin: "form" | "voice" = "form", initialContact = "") => {
    customerCreateMutation.reset();
    setCustomerCreate({initialName, initialContact, origin});
  };
  const submitCustomerCreate = async (values: PartnerQuickCreateValues) => {
    try {
      const option = await customerCreateMutation.mutateAsync(values);
      handleCreatedCustomer(option);
    } catch {
      // Keep the dialog and all sales form fields intact; the dialog renders the error.
    }
  };
  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerKeyword("");
    setValue("customerId", "", {shouldDirty: true, shouldValidate: true});
    setValue("customerName", "", {shouldDirty: true, shouldValidate: true});
    setValue("contact", "", {shouldDirty: true});
  };
  const selectCandidate = (fieldId: string, index: number, option: SalesProductCandidate) => {
    const duplicate = values.items.some((item, itemIndex) => itemIndex !== index && item.productId && item.productId === option.productId);
    if (duplicate) {
      setError(`items.${index}.productId`, {type: "duplicate", message: "同一商品已添加，请直接修改已有行数量"});
      notify.error("同一商品已添加，请直接修改已有行数量");
      return;
    }
    setSelectedCandidates((current) => ({...current, [fieldId]: option}));
    setInventoryKeywords((current) => ({...current, [fieldId]: ""}));
    // A sales order reserves a product quantity; the physical inventory/SN is chosen at outbound.
    setValue(`items.${index}.inventoryId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productId`, option.productId, {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productName`, option.productName, {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.brand`, option.brand, {shouldDirty: true});
    setValue(`items.${index}.model`, option.model, {shouldDirty: true});
    setValue(`items.${index}.vram`, option.vram, {shouldDirty: true});
    setValue(`items.${index}.condition`, option.condition || "出库核验", {shouldDirty: true});
    setValue(`items.${index}.costPrice`, showCost ? option.costPrice : undefined, {shouldDirty: true});
    if (option.estimatedSellPrice && !getValues(`items.${index}.sellPrice`)) setValue(`items.${index}.sellPrice`, Math.round(option.estimatedSellPrice), {shouldDirty: true});
    clearErrors(`items.${index}.productId`);
  };
  const clearCandidate = (fieldId: string, index: number) => {
    setSelectedCandidates((current) => ({...current, [fieldId]: null}));
    setInventoryKeywords((current) => ({...current, [fieldId]: ""}));
    setActiveInventoryFieldId(fieldId);
    setValue(`items.${index}.inventoryId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productName`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.brand`, "", {shouldDirty: true});
    setValue(`items.${index}.model`, "", {shouldDirty: true});
    setValue(`items.${index}.vram`, "", {shouldDirty: true});
    setValue(`items.${index}.condition`, "出库核验", {shouldDirty: true});
    setValue(`items.${index}.costPrice`, undefined, {shouldDirty: true});
  };
  const removeLine = (index: number) => {
    const id = fields[index]?.id;
    if (id) setSelectedCandidates((current) => { const next = {...current}; delete next[id]; return next; });
    remove(index);
  };
  const addLine = () => append(createSalesLineDefaults(values.aftersalesTerms || ""));
  const focusInventoryPicker = (fieldId: string) => setActiveInventoryFieldId(fieldId);
  const updateInventoryKeyword = (fieldId: string, keyword: string) => {
    setActiveInventoryFieldId(fieldId);
    setInventoryKeywords((current) => ({...current, [fieldId]: keyword}));
  };

  const submit = async (submitted: SalesFormValues) => {
    if (!settlementEntry.ready) {setServerError(settlementEntry.reason || "请填写本次收款金额"); return;}
    setServerError(null);
    setConflictError(false);
    setSuccessMessage(null);
    const parsed = salesOrderSchema.safeParse(submitted);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message || "请先完善销售单信息");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({values: submitted});
      submissionIdentity.current.reset();
      editorScope.current = createIdempotencyKey("sales-editor");
      setSuccessMessage(`销售单 ${result.invoiceNo || "已创建"} 已提交，当前状态：${result.outboundStatus || "待出库"}`);
      notify.success("销售单已提交，等待出库绑定 SN");
      discardDraft();
      setRestoredDraftActive(false);
      reset(createSalesDefaults(operatorName));
      setSelectedCustomer(null);
      setSelectedCandidates({});
      setCustomerKeyword("");
      setInventoryKeywords({});
      setActiveInventoryFieldId(null);
      await refreshErpAfterDocument(queryClient, ["state","sales","inventory","finance","customers","ai"]);
    } catch (caught) {
      const error = caught instanceof ApiError ? caught : undefined;
      setServerError(salesSubmitErrorMessage(caught));
      setConflictError(error?.status === 409);
      for (const [path, message] of Object.entries(salesFieldErrors(caught))) {
        setError(path as FieldPath<SalesFormValues>, {type: "server", message});
      }
      if (error?.isUnauthorized) onAuthExpired();
    }
  };
  const handleInvalid = (errors: unknown) => {
    const message = salesFormValidationMessage(errors);
    setServerError(message);
    setConflictError(false);
    notify.error(message);
  };
  const submission = useValidatedFormSubmit({
    form, enabled: active, scope: editorScope.current, getScope: () => editorScope.current,
    canSubmit: () => !createMutation.isPending && settlementEntry.ready, onSubmit: submit, onInvalid: handleInvalid,
  });
  const submitError = submission.feedback || serverError;
  const customerError = !canReadCustomers ? "当前账号没有客户搜索权限" : customerQuery.error ? (customerQuery.error instanceof ApiError && customerQuery.error.isForbidden ? "当前账号没有客户搜索权限" : errorText(customerQuery.error)) : undefined;
  const customerOptions = useMemo(() => {
    const recentRank = new Map(recentCustomerIds.map((id, index) => [id, index]));
    return [...(customerQuery.data || [])].sort((left, right) => (recentRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }, [customerQuery.data, recentCustomerIds]);
  const voiceCustomerOptions = useMemo(() => (voiceCustomerQuery.data || []).filter((option) => option.partnerType === "customer"), [voiceCustomerQuery.data]);
  useEffect(() => {
    if (!pendingVoiceCandidateAssignments.length) return;
    const ready = pendingVoiceCandidateAssignments.filter(({index}) => Boolean(fields[index]));
    if (!ready.length) return;
    setSelectedCandidates((current) => ({...current, ...Object.fromEntries(ready.map(({index, candidate}) => [fields[index]!.id, candidate]))}));
    setPendingVoiceCandidateAssignments((current) => current.filter((assignment) => !ready.some((item) => item.index === assignment.index)));
  }, [fields, pendingVoiceCandidateAssignments]);
  useEffect(() => {
    if (!active || !voiceReview?.customerQuery || !canReadCustomers || !voiceCustomerQuery.isSuccess || voiceCustomerQuery.isFetching || customerCreate || autoCreateVoiceParseId.current === voiceReview.parseId) return;
    const selectableCustomers = voiceCustomerOptions.filter((option) => option.selectable);
    if (selectableCustomers.length) return;
    autoCreateVoiceParseId.current = voiceReview.parseId;
    if (!canCreateCustomer) {
      setVoiceCustomerLookupError("没有找到匹配客户，当前账号也没有新建客户权限。");
      return;
    }
    customerCreateMutation.reset();
    setCustomerCreate({initialName: voiceReview.customerQuery, initialContact: voiceReview.customerContact, origin: "voice"});
  }, [active, canCreateCustomer, canReadCustomers, customerCreate, customerCreateMutation, voiceCustomerOptions, voiceCustomerQuery.isFetching, voiceCustomerQuery.isSuccess, voiceReview]);
  const inventoryError = !canReadInventory ? "当前账号没有库存候选读取权限" : inventoryQuery.error ? errorText(inventoryQuery.error) : undefined;
  const accountError = !canReadSettlementAccounts ? "当前账号没有收款账户读取权限" : accountQuery.error ? (accountQuery.error instanceof ApiError && accountQuery.error.isForbidden ? "当前账号没有收款账户读取权限" : errorText(accountQuery.error)) : undefined;
  const refreshInventoryCandidates = () => {
    setServerError(null);
    setConflictError(false);
    void queryClient.invalidateQueries({queryKey: queryKeys.sales.productCandidates(debouncedInventoryKeyword)}).then(() => inventoryQuery.refetch());
  };

  const prepareVoiceSalesReview = async (result: VoiceParseResult) => {
    const salesDraft = result.sales;
    if (!salesDraft) {
      setVoiceReview({parseId: result.parseId, customerQuery: "", customerContact: "", lines: []});
      setVoiceCustomerLookupError("没有识别到销售单内容，请修改识别文字后重新解析。");
      return;
    }
    const customerQueryText = salesDraft.customer.query.trim();
    const customerContact = salesDraft.customer.phone || salesDraft.customer.wechat || salesDraft.customer.qq || "";
    setVoiceReview({parseId: result.parseId, customerQuery: customerQueryText, customerContact, lines: salesDraft.lines.map((draft) => ({draft, products: [], cards: [], loading: true}))});
    setVoiceCustomerKeyword(customerQueryText);
    setVoiceSelectedCustomer(null);
    setVoiceCustomerLookupError(customerQueryText ? null : "未识别到客户，请使用客户选择器手动选择。");
    autoCreateVoiceParseId.current = "";

    const customerRequest = customerQueryText && canReadCustomers
      ? queryClient.fetchQuery({queryKey: queryKeys.sales.customers(customerQueryText), queryFn: ({signal}) => salesApi.searchCustomers(customerQueryText, signal), staleTime: 30_000})
      : Promise.resolve([] as SalesCustomerOption[]);
    const lineRequests = Promise.all(salesDraft.lines.map(async (draft): Promise<VoiceSalesLineReview> => {
      if (!canReadInventory) return {draft, products: [], cards: [], loading: false, error: "当前账号没有读取库存候选的权限。"};
      try {
        const [allProducts, allCards] = await Promise.all([
          salesApi.searchProductCandidates(draft.productQuery, {showCost, showProfit: permissions.showProfit}),
          salesApi.searchInventory(draft.snTail?.trim() || draft.productQuery, {showCost, showProfit: permissions.showProfit}, undefined, {pageSize: 100, sortDirection: "asc"}),
        ]);
        const products = allProducts.filter((product) => product.saleable && product.availableQuantity >= draft.quantity);
        if (!products.length) return {draft, products: allProducts, cards: [], loading: false, error: allProducts.length ? "型号可售数量不足，请调整数量或重新选择。" : "没有找到可售型号，请核对型号后重新解析。"};
        const productIds = new Set(products.map((product) => product.productId));
        const normalizedTail = draft.snTail?.replace(/\s/g, "").toLocaleUpperCase("en-US");
        const cards = allCards
          .filter((card) => card.saleable && productIds.has(card.productId) && (!normalizedTail || card.serialNumber.replace(/\s/g, "").toLocaleUpperCase("en-US").endsWith(normalizedTail)))
          .sort((left, right) => {
            const leftTime = Date.parse(left.entryTime);
            const rightTime = Date.parse(right.entryTime);
            const leftRank = Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER;
            const rightRank = Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER;
            return leftRank - rightRank || left.id.localeCompare(right.id);
          });
        if (!cards.length) return {draft, products, cards, loading: false, error: normalizedTail ? `未找到 SN 尾号 ${draft.snTail} 对应的可售库存。` : "型号有可售数量，但没有匹配到可选库存卡，请刷新后重试。"};
        if (normalizedTail && cards.length !== 1) return {draft, products, cards, loading: false, error: `SN 尾号 ${draft.snTail} 匹配到多张卡，请改用更完整的型号或 SN。`};
        return {draft, products, cards, selectedInventoryId: cards.length === 1 ? cards[0]!.id : undefined, autoSelected: cards.length === 1, loading: false};
      } catch (error) {
        return {draft, products: [], cards: [], loading: false, error: errorText(error)};
      }
    }));

    const [customerResult, lines] = await Promise.all([
      customerRequest.then((options) => ({options, error: undefined as string | undefined})).catch((error: unknown) => ({options: [] as SalesCustomerOption[], error: errorText(error)})),
      lineRequests,
    ]);
    if (customerQueryText && canReadCustomers) {
      if (customerResult.error) setVoiceCustomerLookupError(customerResult.error);
      else {
        const matched = customerResult.options.find((option) => option.id === salesDraft.customer.matchedId && option.partnerType === "customer" && option.selectable);
        if (matched) setVoiceSelectedCustomer(matched);
        setVoiceCustomerLookupError(null);
      }
    }
    setVoiceReview((current) => current?.parseId === result.parseId ? {...current, lines} : current);
  };

  useEffect(() => {
    if (!active || !handoff || handledHandoffId.current === handoff.parseId) return;
    handledHandoffId.current = handoff.parseId;
    if (isDirty) setHandoffConflictOpen(true);
    else {
      setGlobalVoiceDraft({result: handoff.result, transcript: handoff.transcript});
      setHandoff(null);
    }
  }, [active, handoff, isDirty, setHandoff]);

  const resolveGlobalSalesHandoff = (replace: boolean) => {
    if (!handoff) return;
    if (replace) {
      form.reset(defaultValues);
      setSelectedCustomer(null);
      setSelectedCandidates({});
      setPendingVoiceCandidateAssignments([]);
      setVoiceReview(null);
      setVoiceSelectedCustomer(null);
      setVoiceCustomerKeyword("");
      setVoiceCustomerLookupError(null);
      setRestoredDraftActive(false);
      discardDraft();
      setPaymentResetVersion((version) => version + 1);
      setServerError(null);
      setConflictError(false);
    }
    setHandoffConflictOpen(false);
    setGlobalVoiceDraft({result: handoff.result, transcript: handoff.transcript});
    setHandoff(null);
  };

  const applyVoiceSalesDraftFromControl = async (result: VoiceParseResult, transcript: string) => {
    await applyVoiceSalesDraft(result, transcript);
    if (globalVoiceDraft?.result.parseId === result.parseId) setGlobalVoiceDraft(null);
  };

  const applyVoiceSalesDraft = async (result: VoiceParseResult, transcript: string) => {
    const salesDraft = result.sales;
    const review = voiceReview?.parseId === result.parseId ? voiceReview : null;
    if (!salesDraft || !review) throw new Error("销售候选信息尚未准备完成，请稍后重试");
    if (!voiceSelectedCustomer) throw new Error("请先在客户选择器中确认客户");
    const selections: SalesVoiceLineSelection[] = review.lines.map((line) => {
      const inventory = line.cards.find((card) => card.id === line.selectedInventoryId);
      const product = inventory && line.products.find((candidate) => candidate.productId === inventory.productId);
      if (!inventory || !product || line.loading || line.error) throw new Error(line.error || "请先为每条商品选择可售库存");
      return {draft: line.draft, product, inventory};
    });
    const inferredChannel = voiceSelectedCustomer.partnerType === "vendor" ? "同行网店" : salesChannels.find((channel) => channel === voiceSelectedCustomer.source);
    const startIndex = getValues("items").length;
    const applied = applySalesVoiceDraftToForm({
      sales: {...salesDraft, channel: salesDraft.channel || inferredChannel},
      transcript,
      customer: voiceSelectedCustomer,
      selections,
      existingItems: getValues("items"),
      existingRemarks: getValues("remarks"),
      append,
      setValue,
      resetPaymentSection: () => setPaymentResetVersion((version) => version + 1),
    });
    setSelectedCustomer(voiceSelectedCustomer);
    setRecentCustomerIds((current) => [voiceSelectedCustomer.id, ...current.filter((id) => id !== voiceSelectedCustomer.id)].slice(0, 5));
    setCustomerKeyword("");
    setVoiceCustomerKeyword("");
    setPendingVoiceCandidateAssignments(applied.candidates.map((candidate, index) => ({index: startIndex + index, candidate})));
    clearErrors(["customerId", "customerName"]);
    if (applied.note === "too-long") notify.warning("语音原文较长，未写入备注；商品和收款草稿仍已应用。");
    else notify.success("语音内容已应用到销售单草稿", {description: "实物卡仍需在出库时扫码确认。"});
  };

  const voiceSalesReady = Boolean(
    voiceReview
    && voiceSelectedCustomer?.selectable
    && voiceReview.lines.length > 0
    && voiceReview.lines.every((line) => !line.loading && !line.error && Boolean(line.selectedInventoryId) && line.cards.some((card) => card.id === line.selectedInventoryId)),
  );
  const renderVoiceSalesPreview = (result: VoiceParseResult) => result.sales
    ? <SalesVoiceDraftPreview sales={result.sales} review={voiceReview?.parseId === result.parseId ? voiceReview : null} customer={voiceSelectedCustomer} customerKeyword={voiceCustomerKeyword} customerOptions={voiceCustomerOptions} customerLoading={voiceCustomerQuery.isPending || voiceCustomerQuery.isFetching} customerError={voiceCustomerLookupError || (voiceCustomerQuery.error ? errorText(voiceCustomerQuery.error) : undefined)} canSelectCustomer={canReadCustomers} canCreateCustomer={canCreateCustomer} onCustomerKeywordChange={(keyword) => {setVoiceCustomerKeyword(keyword); setVoiceSelectedCustomer(null); setVoiceCustomerLookupError(null);}} onCustomerSelect={setVoiceSelectedCustomer} onCustomerClear={() => setVoiceSelectedCustomer(null)} onCustomerRetry={() => void voiceCustomerQuery.refetch()} onCreateCustomer={(keyword) => openCustomerCreate(keyword || result.sales!.customer.query, "voice", result.sales!.customer.phone || result.sales!.customer.wechat || result.sales!.customer.qq || "")} onSelectCard={(lineIndex, inventoryId) => setVoiceReview((current) => current?.parseId === result.parseId ? {...current, lines: current.lines.map((line, index) => index === lineIndex ? {...line, selectedInventoryId: inventoryId, autoSelected: false} : line)} : current)} showCost={showCost} />
    : <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-sm text-[var(--erp-color-danger)]">没有识别到销售开单内容，请修改识别文字后重新解析。</p>;

  const salesExtraFields = <><ErpMobileWorkflowPhone><ErpFormSection title="交付与质保"><div className="space-y-3"><label className="block text-sm font-semibold md:col-span-3">物流快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" disabled={values.freeShipping} placeholder={values.freeShipping ? "无需物流" : "如：SF148..."} /></label><label className="block text-sm font-semibold md:col-span-12">整单质保协议<Input {...register("aftersalesTerms")} className="mt-2" placeholder="例如：店保三个月、保到手好" /></label></div></ErpFormSection></ErpMobileWorkflowPhone>
          <ErpFormSection title="销售备注" description="记录交付、售后和客户特殊要求。"><Textarea {...register("remarks")} className="min-h-24" placeholder="销售单备注、交付说明或客户特殊要求" /></ErpFormSection></>;
  return <ErpTransactionPageFrame className="erp-order-entry-page">
    <ErpTransactionHeader title="销售开单" subtitle="选择客户、收款账户和销售型号，提交后由仓库出库扫码绑定 SN。" back={{label: "返回销售管理", fallback: "/sales", onDesktopBack: () => window.history.back()}} pending={createMutation.isPending} actions={<VoiceEntryControl scene="sales" initialDraft={globalVoiceDraft} initialDraftPresentation="desktop" onParsed={prepareVoiceSalesReview} renderPreview={renderVoiceSalesPreview} applyDisabled={!voiceSalesReady} onApply={applyVoiceSalesDraftFromControl} />} phoneActions={<span className="erp-order-draft-label">已自动保存草稿</span>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {successMessage && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-[var(--erp-color-success)]">{successMessage}</p><p className="mt-1 text-xs text-[var(--erp-color-success)]">库存未在开单阶段改为已售出，出库时再完成物理卡绑定。</p></div><ErpStatusBadge label="已提交" tone="success" /></CardContent></Card>}
    {submitError && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm text-[var(--erp-color-danger)]">{submitError}</p>{conflictError && <p className="mt-1 text-xs text-[var(--erp-color-danger)]">库存可能已被其他订单占用；刷新候选不会清空当前表单。</p>}</div><div className="flex shrink-0 items-center gap-2">{conflictError && <Button type="button" size="sm" variant="secondary" onClick={refreshInventoryCandidates}><RefreshCw className="h-3.5 w-3.5" />刷新库存候选</Button>}<Button type="button" size="icon" variant="ghost" onClick={() => { submission.clearFeedback(); setServerError(null); setConflictError(false); }} aria-label="关闭错误提示">×</Button></div></CardContent></Card>}
    {!canReadCustomers && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="p-3 text-sm text-[var(--erp-color-warning)]">当前账号没有 CRM 客户读取权限，客户选择已禁用；请联系管理员授权后再开单。</CardContent></Card>}
    {!canReadInventory && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="p-3 text-sm text-[var(--erp-color-warning)]">当前账号没有查看库存的权限，暂时无法选择商品。</CardContent></Card>}
    <ErpMobileWorkflow resetKey={editorScope.current} pending={createMutation.isPending || submission.validating} phoneAction={<VoiceEntryControl scene="sales" mode="hold" label="按住说话" initialDraft={globalVoiceDraft} initialDraftPresentation="phone" onParsed={prepareVoiceSalesReview} renderPreview={renderVoiceSalesPreview} applyDisabled={!voiceSalesReady} onApply={applyVoiceSalesDraftFromControl} />} steps={[
      {label: "客户与商品", ready: !hasWorkflowErrors(issues, ["customerId", "customerName", "customerPartnerType", "items"]), blockedReason: workflowBlockedReason(issues, ["customerId", "customerName", "customerPartnerType", "items"], "请完善商品价格与数量")},
      {label: "结算"},
    ]} summary={<span className="erp-order-action-total"><strong className="erp-data-number">{formatCurrency(amounts.subtotal)}</strong><small>共 {amounts.quantity} 件</small></span>}>
    <form noValidate onSubmit={submission.onSubmit}>
      <fieldset disabled={createMutation.isPending} className="m-0 min-w-0 border-0 p-0">
      <ErpTransactionColumns>
        <ErpTransactionPrimary>
            <ErpMobileWorkflowSection step={0}>
            <Card className="erp-order-partner"><CardContent className="p-4"><div className="grid items-start gap-3 md:grid-cols-12"><div className="hidden min-w-0 md:block md:col-span-3"><p className="flex items-center justify-between gap-1 text-sm font-semibold">单据编号<span className="shrink-0 rounded-full bg-[var(--erp-color-info-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--erp-color-primary)]">待出库</span></p><div className="mt-2 flex h-[var(--erp-control-height)] items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3"><span className="min-w-0 erp-data-number text-xs text-[var(--erp-color-text-secondary)]">提交后生成</span></div></div><label className="block text-sm font-semibold md:col-span-6">客户档案<div className="mt-2"><CustomerPicker value={selectedCustomer} keyword={customerKeyword} options={customerOptions} loading={customerQuery.isPending || customerQuery.isFetching} error={customerError} disabled={createMutation.isPending || !canReadCustomers} placeholder="搜索客户、供应商或联系方式" searchLabel="搜索销售客户" candidateLabel="客户候选" entityLabel="客户" quickCreateActions={canReadCustomers && canCreateCustomer ? [{label: "新建客户", onClick: openCustomerCreate}] : []} onKeywordChange={setCustomerKeyword} onRetry={() => void customerQuery.refetch()} onSelect={handleSelectCustomer} onClear={clearCustomer} /></div></label><ErpMobileWorkflowDesktop><label className="block text-sm font-semibold md:col-span-3">物流快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" disabled={values.freeShipping} placeholder={values.freeShipping ? "无需物流" : "如：SF148..."} /></label></ErpMobileWorkflowDesktop><ErpMobileWorkflowDesktop><label className="block text-sm font-semibold md:col-span-12">整单质保协议<Input {...register("aftersalesTerms")} className="mt-2" placeholder="例如：店保三个月、保到手好" /></label></ErpMobileWorkflowDesktop></div></CardContent></Card>
          </ErpMobileWorkflowSection>
          <ErpMobileWorkflowSection step={0}>
          <SalesLineItemsTable control={control} setValue={setValue} fields={fields} selectedCandidates={selectedCandidates} pickerKeyword={(fieldId) => inventoryKeywords[fieldId] || ""} pickerOptions={(fieldId) => activeInventoryFieldId === fieldId ? inventoryQuery.data || [] : []} pickerLoading={(fieldId) => activeInventoryFieldId === fieldId && (activeInventoryKeyword.trim() !== debouncedInventoryKeyword.trim() || inventoryQuery.isPending || inventoryQuery.isFetching)} pickerError={(fieldId) => activeInventoryFieldId === fieldId ? inventoryError : undefined} pickerDisabled={createMutation.isPending || !canReadInventory} onPickerFocus={focusInventoryPicker} onPickerKeywordChange={updateInventoryKeyword} onPickerRetry={() => void inventoryQuery.refetch()} onCandidateSelect={selectCandidate} onCandidateClear={clearCandidate} onAdd={addLine} onRemove={removeLine} />
          </ErpMobileWorkflowSection>
          <ErpMobileWorkflowSection step={1}>
          <ErpMobileWorkflowDesktop>{salesExtraFields}</ErpMobileWorkflowDesktop>
          </ErpMobileWorkflowSection>
        </ErpTransactionPrimary>
        <ErpTransactionSecondary>
          <ErpMobileWorkflowSection step={1}>
          <Card className="erp-order-checkout"><CardContent className="space-y-4 p-4"><ErpMobileWorkflowPhone><section className="erp-order-review"><div><span>{selectedCustomer?.name || "请选择客户"}</span><ErpMobileWorkflowEditButton disabled={createMutation.isPending} /></div><details><summary>{amounts.quantity} 件商品 · 查看明细</summary>{(values.items || []).filter((item) => item.productId).map((item, index) => <p key={index}><span>{item.productName}</span><span className="erp-data-number">×{item.quantity}</span></p>)}</details></section></ErpMobileWorkflowPhone><ErpMobileWorkflowDesktop><div><h2 className="text-sm font-semibold">收款信息</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">选择账户并确认全款或挂账状态。</p></div></ErpMobileWorkflowDesktop><SalesPaymentSection disabled={createMutation.isPending} embedded compact control={control} setValue={setValue} accounts={accountQuery.data || []} accountsLoading={accountQuery.isPending || accountQuery.isFetching} accountsError={accountError} accountDisabled={!canReadSettlementAccounts} onRetryAccounts={() => void accountQuery.refetch()} paidAmount={values.paidAmount || 0} totalAmount={amounts.subtotal} salesperson={values.handleBy} resetKey={`${editorScope.current}-${paymentResetVersion}`} onReadinessChange={setSettlementEntry} /><div className="grid grid-cols-2 gap-2"><label className="flex h-10 items-center justify-between rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-semibold cursor-pointer"><span>开发票</span><Switch checked={Boolean(values.needInvoice)} onCheckedChange={(checked) => setValue("needInvoice", checked, {shouldDirty: true, shouldValidate: true})} aria-label="开发票" /></label><label className="flex h-10 items-center justify-between rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-semibold cursor-pointer"><span>运费到付</span><Switch checked={!values.freeShipping} onCheckedChange={(checked) => setValue("freeShipping", !checked, {shouldDirty: true, shouldValidate: true})} aria-label="运费到付" /></label></div><ErpMobileWorkflowPhone><details className="erp-phone-order-extras"><summary>金额明细</summary><SalesAmountSummary embedded amounts={amounts} showCost={showCost && permissions.showProfit} /></details></ErpMobileWorkflowPhone><ErpMobileWorkflowDesktop><div className="border-t border-[var(--erp-color-border)] pt-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">销售结算汇总</h2><span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{amounts.quantity} 件</span></div><SalesAmountSummary embedded amounts={amounts} showCost={showCost && permissions.showProfit} /></div></ErpMobileWorkflowDesktop><ErpMobileWorkflowPhone><details className="erp-phone-order-extras"><summary>物流、质保与备注（可选）</summary>{salesExtraFields}</details></ErpMobileWorkflowPhone><ErpSubmitBar embedded compact showCancel={false} dirty={isDirty} canSubmit={canSubmit} blockedReason={settlementEntry.reason || issues[0]?.message || "请完善当前必填信息"} phoneAction={<VoiceEntryControl scene="sales" mode="hold" label="按住说话" onParsed={prepareVoiceSalesReview} renderPreview={renderVoiceSalesPreview} applyDisabled={!voiceSalesReady} onApply={applyVoiceSalesDraft} />} phoneSummary={<><strong className="erp-data-number">{formatCurrency(amounts.subtotal)}</strong><small>{amounts.quantity} 件 · 提交后待出库</small></>} submitting={createMutation.isPending || submission.validating} onCancel={() => window.history.back()} submitLabel="确认开单 · 待出库" phoneSubmitLabel="提交销售单"><ErpMobileWorkflowDesktop><span>经办人：{operatorName}</span></ErpMobileWorkflowDesktop></ErpSubmitBar></CardContent></Card>
          </ErpMobileWorkflowSection>
        </ErpTransactionSecondary>
      </ErpTransactionColumns>
      </fieldset>
    </form>
    </ErpMobileWorkflow>
    <ErpPartnerQuickCreateDialog open={Boolean(customerCreate)} target="customer" initialName={customerCreate?.initialName || ""} initialContact={customerCreate?.initialContact || ""} pending={customerCreateMutation.isPending} error={customerCreateMutation.error ? customerQuickCreateError(customerCreateMutation.error) : undefined} onOpenChange={(open) => {if (!open) {setCustomerCreate(null); customerCreateMutation.reset();}}} onSubmit={submitCustomerCreate} />
    <VoiceHandoffConflictDialog open={handoffConflictOpen} sceneLabel="销售草稿" onAppend={() => resolveGlobalSalesHandoff(false)} onReplace={() => resolveGlobalSalesHandoff(true)} onCancel={() => {setHandoffConflictOpen(false); setHandoff(null);}} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}

function SalesVoiceDraftPreview({sales, review, customer, customerKeyword, customerOptions, customerLoading, customerError, canSelectCustomer, canCreateCustomer, onCustomerKeywordChange, onCustomerSelect, onCustomerClear, onCustomerRetry, onCreateCustomer, onSelectCard, showCost}: {
  sales: NonNullable<VoiceParseResult["sales"]>;
  review: VoiceSalesReview | null;
  customer: SalesCustomerOption | null;
  customerKeyword: string;
  customerOptions: SalesCustomerOption[];
  customerLoading: boolean;
  customerError?: string;
  canSelectCustomer: boolean;
  canCreateCustomer: boolean;
  onCustomerKeywordChange: (keyword: string) => void;
  onCustomerSelect: (customer: SalesCustomerOption) => void;
  onCustomerClear: () => void;
  onCustomerRetry: () => void;
  onCreateCustomer: (keyword: string) => void;
  onSelectCard: (lineIndex: number, inventoryId: string) => void;
  showCost: boolean;
}) {
  return <section aria-label="销售语音草稿预览" className="space-y-4 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">销售草稿预览</h3><span className="text-xs text-[var(--erp-color-text-muted)]">客户与库存待确认</span></div>
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">客户档案</label>
      <CustomerPicker value={customer} keyword={customerKeyword} options={customerOptions} loading={customerLoading} error={customerError} disabled={!canSelectCustomer} placeholder="搜索客户姓名、电话或微信" searchLabel="搜索销售客户" candidateLabel="销售语音客户候选" entityLabel="客户" quickCreateActions={canCreateCustomer ? [{label: "新建客户", onClick: onCreateCustomer}] : []} onKeywordChange={onCustomerKeywordChange} onRetry={onCustomerRetry} onSelect={onCustomerSelect} onClear={onCustomerClear} />
      {!customer && sales.customer.query && !customerLoading && !customerError && <p className="text-xs text-[var(--erp-color-text-muted)]">识别对象：{sales.customer.query}；请选择匹配客户后再应用。</p>}
    </div>
    {review?.lines.length ? <div className="space-y-3">
      {review.lines.map((line, index) => {
        const selectedCard = line.cards.find((card) => card.id === line.selectedInventoryId);
        return <article key={`${line.draft.productQuery}-${index}`} className={`space-y-2 rounded-[var(--erp-radius-md)] border p-3 ${line.error ? "border-[var(--erp-color-danger)] bg-[var(--erp-color-danger-soft)]" : "border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[var(--erp-color-text)]">{line.draft.productQuery} × {line.draft.quantity}</p><p className="mt-0.5 text-xs text-[var(--erp-color-text-secondary)]">售价：{line.draft.sellPrice === undefined ? "待确认" : `¥${line.draft.sellPrice.toLocaleString("zh-CN")}`}</p></div>{line.draft.snTail && <span className="rounded-full bg-[var(--erp-color-info-soft)] px-2 py-1 text-xs text-[var(--erp-color-primary)]">SN 尾号 {line.draft.snTail}</span>}</div>
          {line.loading && <p role="status" className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />正在查询可售型号与库存卡…</p>}
          {line.error && <p role="alert" className="text-xs font-medium text-[var(--erp-color-danger)]">{line.error} · 此行不能加入销售单</p>}
          {selectedCard && !line.error && <p role="status" className="flex items-center gap-1.5 text-xs text-[var(--erp-color-success)]"><Check className="h-3.5 w-3.5" />{line.autoSelected ? line.draft.snTail ? "已按 SN 尾号自动定位" : "仅匹配到一张可售库存，已自动选择" : "已选择目标库存卡"}：尾号 {serialTailLabel(selectedCard.serialNumber)}</p>}
          {!line.loading && !line.error && line.cards.length > 1 && <fieldset className="space-y-2"><legend className="text-xs font-medium text-[var(--erp-color-text-secondary)]">有多张库存卡，请选择目标卡（按入库时间从早到晚）</legend>{line.cards.map((card) => {
            const product = line.products.find((item) => item.productId === card.productId);
            const selected = line.selectedInventoryId === card.id;
            return <button key={card.id} type="button" role="radio" aria-checked={selected} aria-label={`${product?.productName || card.productName}，SN 尾号 ${serialTailLabel(card.serialNumber)}`} className={`flex w-full items-center justify-between gap-3 rounded-[var(--erp-radius-sm)] border px-3 py-2 text-left text-xs ${selected ? "border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)]" : "border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] hover:bg-[var(--erp-color-surface-muted)]"}`} onClick={() => onSelectCard(index, card.id)}><span className="min-w-0"><span className="block truncate font-semibold text-[var(--erp-color-text)]">{product?.productName || card.productName} · SN 尾号 {serialTailLabel(card.serialNumber)}</span><span className="mt-1 block text-[var(--erp-color-text-secondary)]">{card.condition || "成色待核"} · 库龄 {card.inventoryDays} 天 · {card.warehouse}</span>{showCost && card.costPrice !== undefined && <span className="mt-1 block erp-data-number text-[var(--erp-color-text-muted)]">成本 ¥{card.costPrice.toLocaleString("zh-CN")}</span>}</span>{selected && <Check className="h-4 w-4 shrink-0 text-[var(--erp-color-primary)]" aria-hidden="true" />}</button>;
          })}</fieldset>}
        </article>;
      })}
    </div> : review && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">没有识别到商品行，此草稿不能应用。</p>}
    <div className="grid gap-2 text-xs text-[var(--erp-color-text-secondary)] sm:grid-cols-2"><p>渠道：{sales.channel || "待确认"}</p><p>收款方式：{sales.paymentMethod || "待确认"}{sales.isPaid === undefined ? "" : sales.isPaid ? " · 已收款" : " · 未收款"}</p><p className="sm:col-span-2">售后条款：{sales.aftersalesTerms || "待确认"}</p></div>
    <p className="rounded-[var(--erp-radius-sm)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-primary)]">选卡仅作为可编辑的出库提醒，不会预占或绑定实物库存；提交销售单后仍由仓库扫码确认 SN。</p>
  </section>;
}

function serialTailLabel(serialNumber: string) {
  return serialNumber.replace(/\s/g, "").slice(-4) || "未知";
}
