import {useEffect, useState, type FormEvent} from "react";
import {Button, Input} from "@/src/components/ui";
import {ErpDialogShell, ErpStatusBadge} from "@/src/components/common";
import type {CustomerCategory} from "@/src/types/customer";

type CategoryUpdates = {name?: string; isActive?: boolean};

export function CustomerCategoryManagerDialog({open, categories, pending, error, onOpenChange, onCreate, onUpdate}: {
  open: boolean;
  categories: CustomerCategory[];
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: string, updates: CategoryUpdates) => Promise<unknown>;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    if (!open) {
      setNewName("");
      setEditingId(null);
      setEditingName("");
    }
  }, [open]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || pending) return;
    try {
      await onCreate(name);
      setNewName("");
    } catch {
      // The parent owns shared mutation feedback and error presentation.
    }
  };

  const saveName = async (category: CustomerCategory) => {
    const name = editingName.trim();
    if (!name || pending) return;
    try {
      await onUpdate(category.id, {name});
      setEditingId(null);
      setEditingName("");
    } catch {
      // Keep the edit in place so it can be corrected and retried.
    }
  };

  const toggleActive = async (category: CustomerCategory) => {
    if (pending) return;
    try {
      await onUpdate(category.id, {isActive: !category.isActive});
    } catch {
      // The shared error message remains visible in the dialog.
    }
  };

  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    pending={pending}
    size="md"
    title="客户分类管理"
    description="分类与客户等级相互独立；停用分类不会移除已有客户的分类记录。"
    footer={<Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>完成</Button>}
  >
    <div className="space-y-5">
      <form className="flex items-end gap-2" onSubmit={(event) => {void create(event);}}>
        <label className="min-w-0 flex-1 space-y-1.5 text-sm font-medium text-[var(--erp-color-text)]">
          <span>新增分类</span>
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={40} placeholder="例如：长期客户、渠道客户" disabled={pending} />
        </label>
        <Button type="submit" variant="primary" disabled={pending || !newName.trim()}>新增</Button>
      </form>
      <div className="space-y-2" aria-label="客户分类列表">
        {categories.length ? categories.map((category) => <div key={category.id} className="flex min-h-12 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] px-3 py-2">
          {editingId === category.id ? <>
            <Input className="min-w-0 flex-1" aria-label={`编辑${category.name}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={40} disabled={pending} />
            <Button type="button" size="sm" variant="primary" disabled={pending || !editingName.trim()} onClick={() => {void saveName(category);}}>保存</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => {setEditingId(null); setEditingName("");}}>取消</Button>
          </> : <>
            <span className="min-w-0 flex-1 truncate font-medium">{category.name}</span>
            <ErpStatusBadge label={category.isActive ? "启用" : "已停用"} tone={category.isActive ? "success" : "neutral"} />
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => {setEditingId(category.id); setEditingName(category.name);}}>重命名</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => {void toggleActive(category);}}>{category.isActive ? "停用" : "启用"}</Button>
          </>}
        </div>) : <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-4 text-sm text-[var(--erp-color-text-secondary)]">还没有自定义客户分类。</p>}
      </div>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </div>
  </ErpDialogShell>;
}
