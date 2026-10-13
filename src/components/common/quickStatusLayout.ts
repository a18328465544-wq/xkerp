/** Fit whole facts into the actual header slot, reserving the overflow entry.
 * Never abbreviate a number or derive fit from the browser width alone. */
export function fittedQuickStatusCount(widths: readonly number[], available: number, overflowWidth: number, gap: number, maxVisible: number) {
  const limit = Math.min(widths.length, maxVisible);
  const total = (count: number) => widths.slice(0, count).reduce((sum, width) => sum + Math.ceil(width), 0);
  if (widths.length <= limit && total(limit) + Math.max(0, limit - 1) * gap <= available) return limit;
  for (let count = limit; count > 0; count--) {
    if (total(count) + count * gap + Math.ceil(overflowWidth) <= available) return count;
  }
  return 0;
}
