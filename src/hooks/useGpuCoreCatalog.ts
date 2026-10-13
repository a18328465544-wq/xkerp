import {useRef} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useAuth} from "@/src/app/auth";
import {gpuCoresApi} from "@/src/services/api/endpoints/gpu-cores";
import {queryKeys} from "@/src/services/api/query-keys";
import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import {mergeGpuCoreCatalog} from "@/src/utils/gpuCoreCatalog";
import type {GpuCoreCatalog, GpuCoreCreateInput, GpuCoreRecord, GpuSpecInput} from "@/src/types/gpuCore";

export function useGpuCoreCatalog(enabled: boolean) {
  const {session} = useAuth();
  const client = useQueryClient();
  const identity = useRef(createSubmissionIdentity("gpu-catalog"));
  const queryKey = queryKeys.gpuCores.list(session?.user.id || "");
  const query = useQuery({queryKey, queryFn: ({signal}) => gpuCoresApi.list(signal), enabled: enabled && Boolean(session), staleTime: 60_000, retry: false});
  const accepted = (saved: GpuCoreRecord) => {
    // Use the committed response, not a second GET, to acknowledge a successful write.
    client.setQueryData<GpuCoreCatalog>(queryKey, previous => ({cores: mergeGpuCoreCatalog(previous?.cores || [], [saved]), canManage: previous?.canManage ?? false}));
    identity.current.reset();
    return saved;
  };
  const createCore = async (input: GpuCoreCreateInput) => accepted(await gpuCoresApi.create(input, identity.current.keyFor({kind: "core", input})));
  const addSpec = async (coreId: string, input: GpuSpecInput) => accepted(await gpuCoresApi.addSpec(coreId, input, identity.current.keyFor({kind: "spec", coreId, input})));
  return {...query, createCore, addSpec};
}
