import {Popover as BasePopover} from "@base-ui/react/popover";
import {useEffect, useState} from "react";
import {SlidersHorizontal} from "lucide-react";
import type {ColumnDef, VisibilityState} from "@tanstack/react-table";
import {useRouterState} from "@tanstack/react-router";

export interface ErpColumnVisibilityMenuProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  visibility: VisibilityState;
  onVisibilityChange: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  exclude?: string[];
  label?: string;
  width?: string;
}

function columnId<TData>(column: ColumnDef<TData, unknown>) {
  if (column.id) return column.id;
  if ("accessorKey" in column && column.accessorKey) return String(column.accessorKey);
  return "";
}

function columnLabel<TData>(column: ColumnDef<TData, unknown>, id: string) {
  return typeof column.header === "string" ? column.header : id || "未命名列";
}

/** Shared column menu. Base UI owns Escape/outside-click behavior and the portal stays above page content. */
export function ErpColumnVisibilityMenu<TData>({columns, visibility, onVisibilityChange, exclude = ["actions"], label = "列显示", width = "w-52"}: ErpColumnVisibilityMenuProps<TData>) {
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const options = columns
    .map((column) => ({column, id: columnId(column)}))
    .filter(({id}) => Boolean(id) && !exclude.includes(id));

  return <BasePopover.Root open={open} onOpenChange={setOpen}>
    <BasePopover.Trigger className="erp-focus-ring inline-flex h-[var(--erp-control-height-compact)] cursor-pointer list-none items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs font-semibold text-[var(--erp-color-text-secondary)] transition-colors hover:border-[var(--erp-color-border-strong)] hover:bg-[var(--erp-color-surface-muted)]" aria-label={label}>
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </BasePopover.Trigger>
    <BasePopover.Portal>
      <BasePopover.Positioner className="erp-popover-layer outline-none" sideOffset={8} align="end">
        <BasePopover.Popup className={`${width} max-w-[calc(100vw-1rem)] rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-2 shadow-[var(--erp-shadow-popover)] outline-none`}>
          {options.map(({column, id}) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded-[var(--erp-radius-sm)] px-2 py-1.5 text-xs text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)]">
            <input type="checkbox" checked={visibility[id] !== false} onChange={(event) => onVisibilityChange((current) => ({...current, [id]: event.target.checked}))} />
            {columnLabel(column, id)}
          </label>)}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  </BasePopover.Root>;
}
