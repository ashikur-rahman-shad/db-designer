/**
 * True when the user has selected text (e.g. by click-and-drag). Click handlers on clickable
 * rows (group headers...) should ignore the click that ends a drag-selection so the text can be copied.
 */
export function hasTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const s = window.getSelection();
  return !!s && !s.isCollapsed && s.toString().length > 0;
}
