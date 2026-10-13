import {Button, Select} from "@/src/components/ui";
import type {GpuCoreRecord} from "@/src/types/gpuCore";

export function GpuCorePicker({cores, value, disabled, loading, canCreate, onSelect, onCreate}: {cores: readonly GpuCoreRecord[]; value: string; disabled?: boolean; loading?: boolean; canCreate: boolean; onSelect: (core: GpuCoreRecord | null) => void; onCreate: (searchText: string) => void}) {
  const selected = cores.find(core => core.id === value);
  return <div className="space-y-1">
    <Select searchable aria-label="GPU 核心型号" phoneDialogTitle="选择 GPU 核心" value={value} disabled={disabled} searchLoading={loading} searchResultLimit={150} placeholder="搜索型号，如 5090、4070TI" options={cores.map(core => ({value: core.id, label: core.model, description: `${core.series} · ${core.origin === "official" ? "标准目录" : "门店自定义"}`, searchText: `${core.vendor} ${core.series} ${core.model}`}))} selectedOption={selected ? {value: selected.id, label: selected.model} : undefined} onValueChange={id => onSelect(cores.find(core => core.id === id) || null)} quickCreateAction={canCreate ? {label: "新建核心型号", onClick: onCreate, disabled} : undefined} />
    {canCreate && value && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onCreate("")}>新建其他核心型号</Button>}
  </div>;
}
