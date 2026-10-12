import {useState, type ReactNode} from "react";
import {X} from "lucide-react";
import {Button} from "@/src/components/ui";

export interface ErpActiveFilterTag {
  key: string;
  label: ReactNode;
  /** Omit for a criterion the page owns elsewhere; the tag is then read-only. */
  onRemove?: () => void;
}

/** Tags shown before the overflow tag 「+n」. */
const VISIBLE_TAGS = 5;

/**
 * Desktop applied-filter tags (DESIGN.md: filter tag). A value the user picked,
 * so it can be removed one by one: borderless tonal pill with ×. System states
 * use ErpStatusBadge instead. Renders nothing when no criterion is active.
 */
export function ErpFilterTags({tags, onClearAll, label = "已选条件"}: {tags: readonly ErpActiveFilterTag[]; onClearAll?: () => void; label?: string}) {
  const [expanded, setExpanded] = useState(false);
  if (!tags.length) return null;
  const visible = expanded ? tags : tags.slice(0, VISIBLE_TAGS);
  const hidden = tags.length - visible.length;
  return <div data-erp-component="filter-tags" role="group" aria-label={label} className="erp-filter-tags">
    {visible.map((tag) => <span key={tag.key} className="erp-filter-tag" data-removable={tag.onRemove ? "true" : undefined}>
      <span className="erp-filter-tag-label">{tag.label}</span>
      {tag.onRemove && <Button type="button" variant="ghost" size="xs" className="erp-filter-tag-remove" aria-label={`移除筛选：${typeof tag.label === "string" ? tag.label : tag.key}`} onClick={tag.onRemove}><X aria-hidden="true" /></Button>}
    </span>)}
    {hidden > 0 && <Button type="button" variant="ghost" size="xs" className="erp-filter-tag erp-filter-tag-more" aria-label={`显示其余 ${hidden} 个条件`} onClick={() => setExpanded(true)}>+{hidden}</Button>}
    {onClearAll && tags.length > 1 && <Button type="button" variant="ghost" size="xs" className="erp-filter-tags-clear" onClick={onClearAll}>清空</Button>}
  </div>;
}
