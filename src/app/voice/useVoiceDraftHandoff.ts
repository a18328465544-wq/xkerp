import {useEffect, useRef, useState} from "react";
import {useRouter, useRouterState} from "@tanstack/react-router";
import type {VoiceResolvedScene} from "@/src/types/voice";
import {consumeVoiceDraftHandoff, VOICE_HANDOFF_QUERY_KEY, type VoiceDraftHandoff} from "@/src/features/voice/voiceHandoff";

export function voiceDraftIdFromSearch(search: string) {
  return new URLSearchParams(search).get(VOICE_HANDOFF_QUERY_KEY) || "";
}
export function useVoiceDraftHandoff(scene: Exclude<VoiceResolvedScene, null>, active: boolean) {
  const router = useRouter();
  const searchStr = useRouterState({select: (state) => state.location.searchStr});
  const draftId = voiceDraftIdFromSearch(searchStr);
  const handledId = useRef("");
  const [handoff, setHandoff] = useState<VoiceDraftHandoff | null>(null);

  useEffect(() => {
    if (!active || !draftId || handledId.current === draftId) return;
    handledId.current = draftId;
    setHandoff(consumeVoiceDraftHandoff(draftId, scene));
    const location = router.history.location;
    const search = new URLSearchParams(location.search);
    search.delete(VOICE_HANDOFF_QUERY_KEY);
    const query = search.toString();
    router.history.replace(`${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  }, [active, draftId, router, scene]);

  return {handoff, setHandoff};
}
