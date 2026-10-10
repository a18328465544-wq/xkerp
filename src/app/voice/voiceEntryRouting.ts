import type {VoiceResolvedScene} from "@/src/types/voice";

export const voiceEntryDestinationByScene = {
  purchase: "/purchase/new",
  sales: "/sales/new",
  customer: "/crm/customers/new",
} as const;

export type VoiceEntryDestination = typeof voiceEntryDestinationByScene[keyof typeof voiceEntryDestinationByScene];

export function allowedVoiceScenes(allowedMenus: readonly string[]): Array<Exclude<VoiceResolvedScene, null>> {
  const hasAll = allowedMenus.includes("all");
  return [
    hasAll || allowedMenus.includes("purchase_add") ? "purchase" : null,
    hasAll || allowedMenus.includes("sales_add") ? "sales" : null,
    hasAll || allowedMenus.includes("crm") ? "customer" : null,
  ].filter((scene): scene is Exclude<VoiceResolvedScene, null> => scene !== null);
}

export function voiceEntryDestination(scene: VoiceResolvedScene, allowedScenes: readonly Exclude<VoiceResolvedScene, null>[]): VoiceEntryDestination {
  if (!scene || !allowedScenes.includes(scene)) throw new Error("没有识别到可进入的授权场景，请选择一个有权限的场景后重新解析。");
  return voiceEntryDestinationByScene[scene];
}
