/**
 * مواضع الترتيب الكسرية: إدراج عنصر بين عنصرين دون إعادة ترقيم الكل.
 */
export const POSITION_STEP = 1024;

export function positionBetween(before?: number | null, after?: number | null): number {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null) return after! - POSITION_STEP;
  if (after == null) return before + POSITION_STEP;
  return (before + after) / 2;
}

/** هل ضاقت المسافة بين موضعين لدرجة تستدعي إعادة الترقيم؟ */
export function needsRebalance(before: number, after: number): boolean {
  return Math.abs(after - before) < 1e-6;
}

/** موضع العنصر عند نقله إلى الفهرس index ضمن قائمة مرتبة (مع استبعاد العنصر نفسه) */
export function positionAtIndex(sortedPositions: readonly number[], index: number): number {
  const before = index > 0 ? sortedPositions[index - 1] : null;
  const after = index < sortedPositions.length ? sortedPositions[index] : null;
  return positionBetween(before ?? null, after ?? null);
}
