import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {AlertCircle, ArrowRight, Database, Filter, LogIn, RefreshCw, Search, XCircle} from "lucide-react";
import {useMemo, useState, type FormEvent, type ReactNode} from "react";
import {toast} from "sonner";
import {Link} from "@tanstack/react-router";
import {Button, Card, CardContent, Input} from "@/src/components/ui";
import {ErpDataTable, ErpDetailDrawer, ErpEmptyState, ErpFilterBar, ErpPageHeader, ErpStatusBadge} from "@/src/components/common";
import {ApiError, authApi, getAccessToken, queryKeys, stateApi} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import type {ErpStateSnapshot} from "@/src/services/api/adapters/state.adapter";
import {formatCurrency} from "@/src/lib/format";
import {storeDateTime} from "@/src/utils/storeTime";

export type StateCollectionKey = Exclude<keyof ErpStateSnapshot, "currentRole" | "currentUserId">;
export type DataRow = {id: string; values: Record<string, unknown>};
type RowKind = "text" | "currency" | "status" | "count" | "date";
type ColumnSpec = {key: string; label: string; kind?: RowKind; width?: number; sensitive?: "cost" | "profit"};

export interface StateCollectionPageProps {
  menuId: string;
  title: string;
  subtitle: string;
  collection: StateCollectionKey;
  columns: ColumnSpec[];
  filter?: (row: DataRow) => boolean;
  searchPlaceholder?: string;
  createPath?: string;
  createLabel?: string;
}

export function StateCollectionPage(props: StateCollectionPageProps) {
  const queryClient = useQueryClient();
  const [, setRefresh] = useState(0);
  const hasToken = Boolean(getAccessToken());
  const sessionQuery = useQuery({queryKey: queryKeys.auth.session(), queryFn: ({signal}) => authApi.session(signal), enabled: hasToken, retry: false});
  const session = sessionQuery.data;
  const allowed = Boolean(session && (session.permissions.allowedMenus.includes("all") || session.permissions.allowedMenus.includes(props.menuId)));
  const stateQuery = useQuery({queryKey: queryKeys.state.full(), queryFn: ({signal}) => stateApi.full(signal), enabled: Boolean(session && allowed), retry: false});

  if (!hasToken || sessionQuery.error instanceof ApiError && sessionQuery.error.isUnauthorized) return <CollectionLogin onSuccess={() => { setRefresh((value) => value + 1); void queryClient.invalidateQueries({queryKey: queryKeys.auth.session()}); }} title={props.title} />;
  if (sessionQuery.isPending) return <CollectionState title="正在验证权限" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  if (sessionQuery.error) return <CollectionState title="无法读取登录状态" description={sessionQuery.error.message} icon={<AlertCircle className="h-5 w-5" />} action={<Button onClick={() => void sessionQuery.refetch()}><RefreshCw className="h-4 w-4" />重试</Button>} />;
  if (!session) return <CollectionState title="登录状态为空" icon={<LogIn className="h-5 w-5" />} />;
  if (!allowed) return <CollectionState title={`当前账号没有${props.title}权限`} description="服务器已拒绝该菜单访问（403），请联系管理员授权。" icon={<XCircle className="h-5 w-5" />} />;
  if (stateQuery.isPending || !stateQuery.data) return <CollectionState title={`正在加载${props.title}`} icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  if (stateQuery.error) return <CollectionState title={`${props.title}加载失败`} description={stateQuery.error.message} icon={<AlertCircle className="h-5 w-5" />} action={<Button onClick={() => void stateQuery.refetch()}><RefreshCw className="h-4 w-4" />重试</Button>} />;
  return <CollectionContent {...props} session={session} state={stateQuery.data} onRefresh={() => { void stateQuery.refetch(); toast.success("数据已刷新"); }} />;
}

function CollectionContent({session, state, columns, filter, searchPlaceholder = "搜索名称、编号或备注", createPath, createLabel = "新增", onRefresh, ...props}: StateCollectionPageProps & {session: AuthSession; state: ErpStateSnapshot; onRefresh: () => void}) {
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<DataRow | null>(null);
  const rows = useMemo(() => {
    const raw = state[props.collection];
    if (!Array.isArray(raw)) return [];
    return raw.map((item, index) => {
      const values = item && typeof item === "object" ? item as unknown as Record<string, unknown> : {};
      const id = String(values.id || values.invoiceNo || values.quoteNo || `${props.collection}-${index}`);
      return {id, values};
    }).filter((row) => filter ? filter(row) : true);
  }, [filter, props.collection, state]);
  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row.values).some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [keyword, rows]);
  const tableColumns = useMemo<ColumnDef<DataRow, unknown>[]>(() => columns.map((column) => ({id: column.key, accessorFn: (row: DataRow) => row.values[column.key], header: column.label, size: column.width, cell: ({getValue}) => renderValue(getValue(), column.kind, column.sensitive, session.permissions.showCost, session.permissions.showProfit)})), [columns, session.permissions.showCost, session.permissions.showProfit]);
  const totalAmount = useMemo(() => filtered.reduce((sum, row) => sum + numberValue(row.values.totalAmount) + numberValue(row.values.amount), 0), [filtered]);
  return <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5"><ErpPageHeader title={props.title} subtitle={props.subtitle} actions={<><Button variant="secondary" size="sm" onClick={onRefresh}><RefreshCw className="h-4 w-4" />刷新</Button>{createPath && <Link to={createPath} className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-primary)] px-3 text-xs font-semibold text-white"><ArrowRight className="h-4 w-4" />{createLabel}</Link>}</>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><CollectionMetric label="记录数" value={`${filtered.length}`} detail={`共 ${rows.length} 条`} /><CollectionMetric label="当前金额" value={session.permissions.showProfit ? formatCurrency(totalAmount) : "无权查看"} detail="当前筛选汇总" /><CollectionMetric label="数据来源" value="FastAPI" detail="服务器权限数据" /><CollectionMetric label="更新时间" value={storeDateTime()} detail="手动刷新可更新" /></div><ErpFilterBar actions={<Button variant="ghost" size="sm" onClick={() => setKeyword("")}><Filter className="h-4 w-4" />重置</Button>}><div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></div><span className="inline-flex h-10 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs text-[var(--erp-color-text-secondary)]"><Database className="h-4 w-4" />已连接真实数据</span></ErpFilterBar><ErpDataTable columns={tableColumns} data={filtered} getRowId={(row) => row.id} onRowClick={setDetail} emptyTitle={`暂无${props.title}数据`} emptyDescription="服务器当前没有返回可展示的记录。" /><ErpDetailDrawer open={Boolean(detail)} onOpenChange={(open) => {if (!open) setDetail(null);}} title={detail ? String(detail.values.name || detail.values.productName || detail.values.invoiceNo || detail.id) : props.title} description="V1 数据字段已由 V2 Adapter 转换，未展示的字段仍保留在原记录中"><div className="space-y-3">{detail && Object.entries(detail.values).filter(([, value]) => !Array.isArray(value) && typeof value !== "object").map(([key, value]) => <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-lg bg-[var(--erp-color-surface-muted)] p-3"><span className="text-xs text-[var(--erp-color-text-muted)]">{key}</span><span className="break-words text-sm font-semibold text-[var(--erp-color-text)]">{renderValue(value, undefined, undefined, session.permissions.showCost, session.permissions.showProfit)}</span></div>)}</div></ErpDetailDrawer></div>;
}

function renderValue(value: unknown, kind: RowKind | undefined, sensitive: ColumnSpec["sensitive"], showCost: boolean, showProfit: boolean) {
  if ((sensitive === "cost" && !showCost) || (sensitive === "profit" && !showProfit)) return <span className="text-[var(--erp-color-text-muted)]">无权限</span>;
  if (kind === "currency") return <span className="font-mono font-semibold">{formatCurrency(numberValue(value))}</span>;
  if (kind === "count") return <span className="font-semibold">{numberValue(value)}</span>;
  if (kind === "status") return <ErpStatusBadge label={String(value || "—")} tone={statusTone(String(value || ""))} />;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function statusTone(value: string) { return /已付款|已收款|已入库|已完成|通过|已解决|已核销|启用|正常/.test(value) ? "success" as const : /待|未|检测中|部分|处理中|预警/.test(value) ? "warning" as const : /退|拒|失败|异常|欠款|关闭/.test(value) ? "danger" as const : "neutral" as const; }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function CollectionMetric({label, value, detail}: {label: string; value: string; detail: string}) { return <Card><CardContent className="min-h-[100px] p-4"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><p className="mt-2 font-mono text-2xl font-bold text-[var(--erp-color-text)]">{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>; }
function CollectionLogin({onSuccess, title}: {onSuccess: () => void; title: string}) { const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitting(true); setError(""); try { await authApi.login(username.trim(), password); toast.success("登录成功"); onSuccess(); } catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败"); } finally { setSubmitting(false); } }; return <div className="mx-auto flex min-h-[520px] max-w-[440px] items-center justify-center"><Card className="w-full"><CardContent className="p-7"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><LogIn className="h-5 w-5" /></span><div><h1 className="text-lg font-bold">登录{title}</h1><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">数据由现有 FastAPI 权限接口保护。</p></div></div><form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold">账号<Input className="mt-2" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label className="block text-sm font-semibold">密码<Input className="mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <p className="rounded-lg bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}<Button className="w-full" variant="primary" type="submit" disabled={submitting}>{submitting ? "登录中…" : `登录并查看${title}`}</Button></form></CardContent></Card></div>; }
function CollectionState({title, description, icon, action}: {title: string; description?: string; icon: ReactNode; action?: ReactNode}) { return <div className="mx-auto flex min-h-[420px] max-w-[520px] items-center justify-center"><Card className="w-full"><CardContent className="flex flex-col items-center gap-3 p-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><h1 className="text-lg font-bold">{title}</h1>{description && <p className="text-sm text-[var(--erp-color-text-secondary)]">{description}</p>}{action}</CardContent></Card></div>; }
