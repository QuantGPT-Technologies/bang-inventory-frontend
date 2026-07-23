/** Caps an array to `max` items, reporting how many were hidden -- used by detail-page cards
 *  whose lists have no natural page limit (e.g. a batch's lots, a lot's step history), so a
 *  card's content never grows past what fits on screen. */
export function capList<T>(items: T[], max: number): { visible: T[]; hiddenCount: number } {
  if (items.length <= max) return { visible: items, hiddenCount: 0 };
  return { visible: items.slice(0, max), hiddenCount: items.length - max };
}
