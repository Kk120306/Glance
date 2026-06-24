/** True when focusId references a target that is still registered. */
export function isFocusValid(focusId: string | null, targetIds: string[]): boolean {
  return focusId != null && targetIds.includes(focusId)
}

/**
 * Pick the focus id to use: keep a valid focus unless forceFirst, otherwise
 * return the first target in reading order (or null when no targets).
 */
export function resolveDefaultFocusId(
  focusId: string | null,
  orderedIds: string[],
  opts?: { forceFirst?: boolean },
): string | null {
  if (orderedIds.length === 0) return null
  if (!opts?.forceFirst && isFocusValid(focusId, orderedIds)) return focusId
  return orderedIds[0] ?? null
}

/** Clamp a scan-mode index after the target list shrinks or grows. */
export function clampScanIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return index < 0 ? 0 : index >= count ? count - 1 : index
}
