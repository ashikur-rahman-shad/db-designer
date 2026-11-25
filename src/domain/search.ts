import { tableLayout, type LayoutOptions, type TableLayout } from "./layout";
import type { Column, ColumnGroup, DesignData, TableModel } from "./types";

/** The text to look for: trimmed and lower-cased ("" = no search). */
export const normalizeQuery = (s: string) => s.trim().toLowerCase();

const has = (v: string, q: string) => v.toLowerCase().includes(q);

/** A column matches by name, description, enum values or default value. */
export const columnMatches = (c: Column, q: string) => has(c.name, q) || has(c.description, q) || has(c.enumValues, q) || has(c.defaultValue, q);
export const groupMatches = (g: ColumnGroup, q: string) => has(g.name, q) || has(g.description, q);
/** A relationship line matches by its label text. */
export const labelMatches = (label: string, q: string) => has(label, q);
export const tableNameMatches = (t: TableModel, q: string) => has(t.name, q) || has(t.description, q);

/** A table matches when its name / description or any of its columns / groups does. */
export function tableMatches(t: TableModel, q: string): boolean {
  if (!q) return true;
  return tableNameMatches(t, q) || t.items.some((i) => (i.kind === "column" ? columnMatches(i, q) : groupMatches(i, q) || i.columns.some((c) => columnMatches(c, q))));
}

/**
 * Layout changes that reveal a table's matches on the canvas: a match that the logical view / "hide groups" leaves out
 * is shown anyway (other hidden columns stay hidden), and collapsed groups that contain a matching column are opened.
 */
function revealOptions(data: DesignData, table: TableModel, q: string): Partial<LayoutOptions> | null {
  const colIds = new Set<string>();
  const groupIds = new Set<string>();
  const openGroups = new Set<string>();
  for (const i of table.items) {
    if (i.kind === "column") { if (columnMatches(i, q)) colIds.add(i.id); continue; }
    if (groupMatches(i, q)) groupIds.add(i.id);
    for (const c of i.columns) if (columnMatches(c, q)) { colIds.add(c.id); openGroups.add(i.id); }
  }
  if (colIds.size === 0 && groupIds.size === 0) return null;
  const collapsedIds = table.items.filter((i) => i.kind === "group" && i.collapsed && !openGroups.has(i.id)).map((i) => i.id);
  return { revealIds: [...colIds, ...groupIds], collapsedIds };
}

/** `tableLayout`, with the matches of the search `q` (already normalized) revealed. */
export function searchedLayout(data: DesignData, table: TableModel, q: string): TableLayout {
  const extra = q ? revealOptions(data, table, q) : null;
  return tableLayout(data, table, extra ?? {});
}
