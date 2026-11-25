import type { MdBlock } from "./dataDictionary";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Inline DOM -> Markdown for a selection that lies inside a single block / cell. */
function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return "";
  const el = node as Element;
  const inner = Array.from(node.childNodes).map(inline).join("");
  switch (el.tagName?.toLowerCase()) {
    case "code": return `\`${inner}\``;
    case "strong": case "b": return `**${inner}**`;
    case "em": case "i": return `*${inner}*`;
    case "a": return `[${inner}](${el.getAttribute("href") ?? ""})`;
    case "br": return "<br>";
    default: return inner;
  }
}

/** The part of `range` that falls inside `el`, or null if it selects no text there. */
function clip(range: Range, el: Element): Range | null {
  const box = document.createRange();
  box.selectNodeContents(el);
  const r = range.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, box) < 0) r.setStart(box.startContainer, box.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, box) > 0) r.setEnd(box.endContainer, box.endOffset);
  return norm(r.toString()) ? r : null;
}

/**
 * Turns the current text selection inside `root` into Markdown, or returns null to let the
 * browser copy normally. Blocks carry their source Markdown (`data-block` = index into `blocks`):
 *  - whole blocks / several blocks  -> their exact source Markdown,
 *  - rows of a table                -> header + only the selected rows,
 *  - a snippet inside one block     -> that snippet with inline formatting (code, bold, links).
 */
export function selectionToMarkdown(root: HTMLElement, blocks: MdBlock[]): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const hits = Array.from(root.querySelectorAll<HTMLElement>("[data-block]"))
    .filter((el) => range.intersectsNode(el))
    .map((el) => ({ el, part: clip(range, el) }))
    .filter((h): h is { el: HTMLElement; part: Range } => h.part !== null);
  if (hits.length === 0) return null;

  const blockMd = (el: HTMLElement, part: Range, single: boolean): string => {
    const b = blocks[Number(el.dataset.block)];
    const whole = norm(part.toString()) === norm(el.textContent ?? "");
    if (!b.table) return single && !whole ? inline(part.cloneContents()) : b.md;

    const rows = Array.from(el.querySelectorAll("tbody tr"));
    const picked = rows.map((tr, i) => ({ i, hit: clip(part, tr) })).filter((r) => r.hit);
    const headHit = Array.from(el.querySelectorAll("thead tr")).some((tr) => clip(part, tr));
    // Selection inside one cell: plain inline text of that snippet.
    const cells = Array.from(el.querySelectorAll("th, td"));
    const touched = cells.filter((c) => clip(part, c));
    if (single && !whole && touched.length <= 1) return inline(part.cloneContents());

    const lines = [b.table.head, b.table.sep];
    if (whole || (headHit && picked.length === rows.length)) lines.push(...b.table.rows);
    else lines.push(...picked.map((r) => b.table!.rows[r.i]));
    return lines.join("\n");
  };

  const single = hits.length === 1;
  const md = hits.map((h) => blockMd(h.el, h.part, single)).join(single ? "" : "\n\n");
  // Everything selected (e.g. Ctrl/Cmd+A): identical to "Copy Markdown".
  return !single && hits.length === blocks.length ? md + "\n" : md;
}
