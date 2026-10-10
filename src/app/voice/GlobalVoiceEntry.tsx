import {ArrowRight, Mic} from "lucide-react";
import {useNavigate} from "@tanstack/react-router";
import {useAuth} from "@/src/app/auth";
import {VoiceEntryControl} from "@/src/app/voice/VoiceEntryControl";
import type {VoiceParseResult, VoiceResolvedScene} from "@/src/types/voice";
import {saveVoiceDraftHandoff} from "@/src/features/voice/voiceHandoff";
import type {VoiceCaptureMode} from "@/src/features/voice/VoiceCaptureButton";
import {allowedVoiceScenes, voiceEntryDestination} from "./voiceEntryRouting";

export function GlobalVoiceEntry({mode = "toggle"}: {mode?: VoiceCaptureMode}) {
  const {session} = useAuth();
  const navigate = useNavigate();
  const allowedScenes = allowedVoiceScenes(session?.permissions.allowedMenus || []);
  if (!allowedScenes.length) return null;

  const applyAndRoute = async (result: VoiceParseResult, transcript: string) => {
    const destination = voiceEntryDestination(result.scene, allowedScenes);
    saveVoiceDraftHandoff(result, transcript);
    await navigate({to: destination, search: {voiceDraftId: result.parseId}});
  };

  return <VoiceEntryControl
    scene="auto"
    mode={mode}
    label={mode === "hold" ? "按住说话" : "语音快捷录入"}
    compactTrigger={mode === "toggle"}
    allowedScenes={allowedScenes}
    applyLabel="确认并打开对应页面"
    onApply={applyAndRoute}
    renderPreview={(result) => <GlobalVoicePreview result={result} allowedScenes={allowedScenes} />}
  />;
}
function GlobalVoicePreview({result, allowedScenes}: {result: VoiceParseResult; allowedScenes: readonly Exclude<VoiceResolvedScene, null>[]}) {
  const scene = result.scene;
  const sceneLabel = scene === "purchase" ? "采购开单" : scene === "sales" ? "销售开单" : scene === "customer" ? "新建客户" : "待选择录入场景";
  const partner = result.purchase?.partner.query || result.sales?.customer.query;
  const lines = result.purchase?.lines || result.sales?.lines || [];
  const routeHint = scene && allowedScenes.includes(scene) ? `确认后将打开「${sceneLabel}」，识别内容只会填入待确认草稿。` : "场景未确定或当前账号无权访问；选择有权限的场景并重新解析后才能继续。";
  return <section aria-label="语音快捷录入预览" className="space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3">
    <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Mic className="h-4 w-4" aria-hidden="true" /></span><div><h3 className="text-sm font-semibold">{sceneLabel}</h3><p className="text-xs text-[var(--erp-color-text-muted)]">{result.source === "ai" ? "AI 解析" : "规则解析"}</p></div></div>
    {partner && <p className="text-sm text-[var(--erp-color-text-secondary)]">客户 / 供应商：<strong className="text-[var(--erp-color-text)]">{partner}</strong></p>}
    {result.customer && <p className="text-sm text-[var(--erp-color-text-secondary)]">客户线索：<span className="text-[var(--erp-color-text)]">{result.customer.rawTextForQuickCapture}</span></p>}
    {lines.length > 0 && <ul className="space-y-2">{lines.map((line, index) => <li key={`${line.productQuery}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 text-sm"><span>{line.productQuery} × {line.quantity}</span><span className="erp-data-number text-[var(--erp-color-text-secondary)]">{"buyPrice" in line && line.buyPrice !== undefined ? `¥${line.buyPrice}` : "sellPrice" in line && line.sellPrice !== undefined ? `¥${line.sellPrice}` : "待确认价格"}</span></li>)}</ul>}
    {result.issues.length > 0 && <ul className="space-y-1 text-xs text-[var(--erp-color-warning)]">{result.issues.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>}
    <p className="flex items-start gap-1.5 text-xs leading-5 text-[var(--erp-color-text-muted)]"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{routeHint}</p>
  </section>;
}
