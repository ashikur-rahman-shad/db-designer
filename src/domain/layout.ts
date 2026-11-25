import { GRID, snap } from "./factory";
import { indexName, isUniqueColumn } from "./model";
import { textWidth, wrapText } from "./textMetrics";
import type { Column, DesignData, DesignSettings, TableModel } from "./types";

export const HEADER_H = 40;
export const LINE_H = 14;
const KEY_MIN = 30;
const MIN_WIDTH = 160;
const CELL_PAD = 12; // 6px each side
const DESC_MIN = 80;

/** Row height for `lines` text lines: padding + lines, rounded up to the grid. */
export const rowHeight = (lines: number, pad = 16) => Math.ceil((Math.max(1, lines) * LINE_H + pad) / GRID) * GRID;

export type LayoutRow =
  | { type: "tabledesc"; id: string; top: number; height: number; lines: string[] }
  | { type: "group"; id: string; top: number; height: number; collapsed: boolean; hiddenCount: number; descLines: string[] }
  | {
      type: "column"; id: string; top: number; height: number; groupId?: string;
      /** Key cell, one line each: PK, FK, then the UQ / NN / AI tags. */
      pk: boolean; fk: boolean; tags: string[];
      /** Text of the primary-key label: "PK", or "PK1", "PK2", ... for the members of a composite primary key. */
      pkLabel: string;
      descLines: string[];
      /** Enum values packed into lines of pills (shown under the description, or in the enum column). */
      enumLines: string[][];
      /** Extra lines (references, default, check) for the detail column. */
      detailLines: string[];
    }
  | { type: "empty"; id: string; top: number; height: number };

export interface TableLayout {
  width: number;
  height: number;
  rows: LayoutRow[];
  /** Widths of the tabular columns (0 = column not shown). They sum to `width`. */
  cols: { key: number; name: number; type: number; desc: number; enum: number; details: number };
  /** Y offset (relative to table top, on the grid) where a line attaches for a column id. */
  anchorY: Record<string, number>;
}

export type LayoutOptions = Pick<DesignSettings, "viewMode" | "showDescriptions" | "showAttributes"> & Partial<Pick<DesignSettings, "logicalMandatory" | "hideGroups">> & {
  /** Ignore logical view and collapsed groups (used by the table detail dialog). */
  expandAll?: boolean;
  /** Add a details column with foreign-key target, default and check (detail dialog). */
  detail?: boolean;
  /** columnId -> "table.column" text for foreign keys (only used with `detail`). */
  refs?: Record<string, string>;
  /** Columns that are foreign keys (they get an "FK" line in the key cell). */
  fkColumnIds?: string[];
  /** Cap for the auto-sized description width. */
  maxDescWidth?: number;
  /**
   * "inline" (default, canvas): description lines, then enum value pills, under the column name.
   * "column" (detail dialog): description and enum values each get their own column.
   */
  descriptionStyle?: "inline" | "column";
  /** Explicit set of collapsed group ids (overrides each group's own `collapsed` flag). */
  collapsedIds?: string[];
  /** Ids of columns / groups to show although the logical view or "Hide groups" would leave them out (search matches). */
  revealIds?: string[];
};

const TAG_FONT = 9;
const pillWidth = (t: string) => textWidth(t, TAG_FONT, { bold: true }) + 8 + 3;

/** columnId -> the kinds of index the column takes part in: single-column unique "UQ", multi-column unique "CK" (composite), any other "IX". */
function indexKinds(table: TableModel): Map<string, Set<"UQ" | "CK" | "IX">> {
  const m = new Map<string, Set<"UQ" | "CK" | "IX">>();
  for (const ix of table.indexes ?? []) {
    for (const id of ix.columnIds) {
      const s = m.get(id) ?? new Set();
      s.add(!ix.unique ? "IX" : ix.columnIds.length === 1 ? "UQ" : "CK");
      m.set(id, s);
    }
  }
  return m;
}

function tagsOf(c: Column, o: LayoutOptions, kinds: Map<string, Set<"UQ" | "CK" | "IX">>): string[] {
  if (!o.showAttributes) return [];
  const t: string[] = [];
  const k = kinds.get(c.id);
  if (c.unique || k?.has("UQ")) t.push("UQ");
  if (k?.has("CK")) t.push("CK");
  if (k?.has("IX")) t.push("IX");
  if (c.notNull && !c.primaryKey) t.push("NN");
  if (c.autoIncrement) t.push("AI");
  return t;
}

const enumOf = (c: Column, o: LayoutOptions): string[] =>
  o.showAttributes ? c.enumValues.split(",").map((v) => v.trim()).filter(Boolean) : [];

function detailsOf(c: Column, o: LayoutOptions, table: TableModel): string[] {
  if (!o.detail) return [];
  const x: string[] = [];
  for (const ix of table.indexes ?? []) {
    if (ix.columnIds.includes(c.id)) x.push(`${ix.unique ? "unique" : "index"} ${indexName(table, ix)}`);
  }
  if (o.refs?.[c.id]) x.push(`→ ${o.refs[c.id]}`);
  if (c.defaultValue.trim()) x.push(`default ${c.defaultValue.trim()}`);
  if (c.check.trim()) x.push(`check ${c.check.trim()}`);
  return x;
}

/** Greedy packing of pills into lines no wider than `maxW` (an oversized pill gets its own line). */
function packPills(values: string[], maxW: number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let w = 0;
  for (const v of values) {
    const pw = pillWidth(v);
    if (cur.length && w + pw > maxW) { lines.push(cur); cur = []; w = 0; }
    cur.push(v);
    w += pw;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** `layoutTable` for a table of a design: settings and foreign keys are taken from `data`. */
export function tableLayout(data: DesignData, table: TableModel, extra: Partial<LayoutOptions> = {}): TableLayout {
  const fkColumnIds = data.relationships.filter((r) => r.fromTableId === table.id).map((r) => r.fromColumnId);
  return layoutTable(table, { ...data.settings, fkColumnIds, ...extra });
}

/**
 * Computes the tabular layout of a table: column widths, wrapped text, row heights and the
 * line anchors. Widths are grid multiples; auto-width tables grow with their content,
 * fixed-width tables give the leftover space to the description column.
 */
export function layoutTable(table: TableModel, opts: LayoutOptions): TableLayout {
  const logical = !opts.expandAll && opts.viewMode === "logical";
  const asColumn = opts.descriptionStyle === "column";
  // Groups are hidden (columns laid out as if no group existed) with the "Hide groups" option, and always in the
  // logical view. The detail dialog (expandAll) always shows them.
  const flat = (!!opts.hideGroups || logical) && !opts.expandAll;
  const fkSet = new Set(opts.fkColumnIds ?? []);
  const reveal = new Set(opts.revealIds ?? []);
  // Logical view: a column shows when its own flag is on, or when it has a mandatory property (PK / FK / ...).
  const mandatory = new Set(opts.logicalMandatory ?? ["pk", "fk"]);
  const logicalVisible = (c: Column) =>
    c.logicalErd ||
    reveal.has(c.id) ||
    (mandatory.has("pk") && c.primaryKey) ||
    (mandatory.has("fk") && fkSet.has(c.id)) ||
    (mandatory.has("nn") && c.notNull) ||
    (mandatory.has("uq") && isUniqueColumn(table, c)) ||
    (mandatory.has("ai") && c.autoIncrement);

  // 1. What is visible.
  type Vis = { kind: "column"; c: Column } | { kind: "group"; g: (typeof table.items)[number] & { kind: "group" }; cols: Column[]; collapsed: boolean };
  const vis: Vis[] = [];
  for (const item of table.items) {
    if (item.kind === "column") {
      if (!(logical && !logicalVisible(item))) vis.push({ kind: "column", c: item });
    } else if (flat && !reveal.has(item.id)) {
      for (const c of item.columns) if (!(logical && !logicalVisible(c))) vis.push({ kind: "column", c });
    } else {
      const cols = logical ? item.columns.filter(logicalVisible) : item.columns;
      if (logical && cols.length === 0 && !reveal.has(item.id)) continue;
      vis.push({ kind: "group", g: item, cols, collapsed: opts.collapsedIds ? opts.collapsedIds.includes(item.id) : !opts.expandAll && item.collapsed });
    }
  }
  const shown: Column[] = vis.flatMap((v) => (v.kind === "column" ? [v.c] : v.collapsed ? [] : v.cols));

  // 2. Column widths from content.
  const kinds = indexKinds(table);
  // Members of a composite primary key are labelled PK1, PK2, ... in column order.
  const pkCols = table.items.flatMap((i) => (i.kind === "group" ? i.columns : [i])).filter((c) => c.primaryKey);
  const pkLabelOf = (c: Column) => (!c.primaryKey ? "" : pkCols.length > 1 ? `PK${pkCols.indexOf(c) + 1}` : "PK");
  const hasDesc = opts.showDescriptions && shown.some((c) => c.description.trim());
  const hasEnum = shown.some((c) => enumOf(c, opts).length > 0);
  const hasDetails = shown.some((c) => detailsOf(c, opts, table).length > 0);

  const keyContent = Math.max(
    0,
    ...shown.map((c) => {
      const tags = tagsOf(c, opts, kinds);
      return Math.max(c.primaryKey || fkSet.has(c.id) ? textWidth(pkLabelOf(c) || "PK", 9, { bold: true }) : 0, tags.reduce((s, t) => s + pillWidth(t), 0));
    }),
  );
  const keyW = Math.max(KEY_MIN, Math.ceil(keyContent) + 10);
  let nameW = Math.max(40, ...shown.map((c) => Math.ceil(textWidth(c.name, 12, { mono: true }) * (c.primaryKey ? 1.06 : 1)) + CELL_PAD));
  let typeW = Math.max(30, ...shown.map((c) => Math.ceil(textWidth(c.dataType, 10, { mono: true })) + CELL_PAD));

  const longestDesc = hasDesc ? Math.max(...shown.flatMap((c) => c.description.split("\n").map((l) => textWidth(l, 10)))) : 0;
  const descWant = Math.max(DESC_MIN, Math.min(Math.ceil(longestDesc) + CELL_PAD, opts.maxDescWidth ?? 240));
  const enumTotal = hasEnum ? Math.max(...shown.map((c) => enumOf(c, opts).reduce((s, v) => s + pillWidth(v), 0))) : 0;

  let descW = 0;
  let enumW = 0;
  if (asColumn) {
    if (hasDesc) descW = descWant;
    if (hasEnum) enumW = Math.ceil(Math.min(enumTotal, 170)) + CELL_PAD;
  } else {
    // Inline: description + enum pills sit under the name + type cells, which must be wide enough.
    const want = Math.max(hasDesc ? descWant : 0, hasEnum ? Math.min(Math.ceil(enumTotal) + CELL_PAD, opts.maxDescWidth ?? 240) : 0);
    if (want && nameW + typeW < want) nameW += want - (nameW + typeW);
  }
  let detailsW = 0;
  if (hasDetails) {
    const m = Math.max(...shown.flatMap((c) => detailsOf(c, opts, table).map((e) => Math.min(textWidth(e, 10), 170))));
    detailsW = Math.ceil(m) + CELL_PAD;
  }

  const sum = keyW + nameW + typeW + descW + enumW + detailsW;
  const headerMin = textWidth(table.name, 14, { bold: true }) + 28;
  const groupMin = Math.max(0, ...vis.flatMap((v) => (v.kind === "group" ? [textWidth(v.g.name, 12, { bold: true }) + 56] : [])));
  const auto = table.autoWidth !== false;
  const width = auto
    ? Math.ceil(Math.max(MIN_WIDTH, headerMin, groupMin, sum) / GRID) * GRID
    : Math.max(MIN_WIDTH, snap(table.width));

  // 3. Distribute leftover / shrink.
  const leftover = width - sum;
  if (leftover >= 0) {
    if (descW) descW += leftover; else nameW += leftover;
  } else {
    const fixed = keyW + enumW + detailsW;
    const avail = width - fixed - (descW ? DESC_MIN : 0);
    const need = nameW + typeW;
    const k = Math.max(0.3, Math.min(1, avail / need));
    nameW = Math.floor(nameW * k);
    typeW = Math.floor(typeW * k);
    const rest = width - fixed - nameW - typeW;
    if (descW) descW = rest; else nameW += rest;
  }

  // 4. Rows.
  const rows: LayoutRow[] = [];
  const anchorY: Record<string, number> = {};
  const headerAnchor = snap(HEADER_H / 2);
  const anchorFor = (top: number, h: number) => snap(top + h / 2);
  let y = HEADER_H;

  if (opts.showDescriptions && table.description.trim()) {
    const lines = wrapText(table.description, width - 24, 11);
    const height = rowHeight(lines.length, 12);
    rows.push({ type: "tabledesc", id: "tabledesc", top: y, height, lines });
    y += height;
  }

  const pushColumn = (c: Column, groupId?: string) => {
    const tags = tagsOf(c, opts, kinds);
    const pk = c.primaryKey;
    const fk = fkSet.has(c.id);
    const keyLines = (pk ? 1 : 0) + (fk ? 1 : 0) + (tags.length ? 1 : 0);
    const textW = (asColumn ? descW : nameW + typeW) - CELL_PAD;
    const descLines = hasDesc && c.description.trim() ? wrapText(c.description, textW, 10) : [];
    const ev = enumOf(c, opts);
    const enumLines = ev.length ? packPills(ev, (asColumn ? enumW : nameW + typeW) - CELL_PAD) : [];
    const detailLines = detailsOf(c, opts, table).flatMap((e) => wrapText(e, detailsW - CELL_PAD, 10));
    const lines = asColumn
      ? Math.max(1, descLines.length, enumLines.length, keyLines, detailLines.length)
      : Math.max(1 + descLines.length + enumLines.length, keyLines, detailLines.length);
    const height = rowHeight(lines);
    rows.push({ type: "column", id: c.id, top: y, height, groupId, pk, pkLabel: pkLabelOf(c), fk, tags, descLines, enumLines, detailLines });
    anchorY[c.id] = anchorFor(y, Math.min(height, 30));
    y += height;
  };

  for (const v of vis) {
    if (v.kind === "column") { pushColumn(v.c); continue; }
    const descLines = opts.showDescriptions && v.g.description.trim() ? wrapText(v.g.description, width - 40, 10) : [];
    const height = rowHeight(1 + descLines.length);
    const top = y;
    rows.push({ type: "group", id: v.g.id, top, height, collapsed: v.collapsed, hiddenCount: v.cols.length, descLines });
    y += height;
    for (const c of v.g.columns) {
      if (v.collapsed || !v.cols.includes(c)) anchorY[c.id] = anchorFor(top, Math.min(height, 30));
      else pushColumn(c, v.g.id);
    }
  }
  // Columns hidden by the logical view attach to the table header.
  for (const item of table.items) {
    const cs = item.kind === "column" ? [item] : item.columns;
    for (const c of cs) if (!(c.id in anchorY)) anchorY[c.id] = headerAnchor;
  }

  if (!rows.some((r) => r.type !== "tabledesc")) {
    rows.push({ type: "empty", id: "empty", top: y, height: 30 });
    y += 30;
  }
  return {
    width,
    height: Math.ceil(y / GRID) * GRID,
    rows,
    anchorY,
    cols: { key: keyW, name: nameW, type: typeW, desc: descW, enum: enumW, details: detailsW },
  };
}
