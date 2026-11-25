/**
 * Export the diagram as a plain, native SVG (rects, paths and text only — no <foreignObject>, CSS, filters or
 * embedded fonts), so editors such as Lucidchart can import it. It is drawn from the design data with the same layout
 * and routing code the canvas uses, so it looks like the canvas without depending on the DOM.
 */
import { HEADER_H, LINE_H, type LayoutRow, type TableLayout } from "@/domain/layout";
import { allColumns, findColumn, isUniqueColumn } from "@/domain/model";
import { labelShape, labelSize, roundedPath, routeRelationship, tableBoxes, type Route, type Side } from "@/domain/routing";
import { textWidth } from "@/domain/textMetrics";
import type { DesignData, Point, TableModel } from "@/domain/types";

const SANS = "Arial,Helvetica,sans-serif";
const MONO = "Courier New,monospace";
const INK = "#0f172a";

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `pct`% of colour `a` over `b` as a flat hex colour (SVG importers do not all understand opacity or color-mix). */
function mix(a: string, pct: number, b = "#ffffff"): string {
  const rgb = (c: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return a;
  return "#" + x.map((v, i) => Math.round(v * pct / 100 + y[i] * (1 - pct / 100)).toString(16).padStart(2, "0")).join("");
}

interface TextOpts { size: number; fill: string; mono?: boolean; bold?: boolean; italic?: boolean; anchor?: "middle" | "end" }

/** One line of text whose vertical centre is `cy` (no dominant-baseline: not every importer supports it). */
function text(s: string, x: number, cy: number, o: TextOpts): string {
  if (!s) return "";
  return `<text x="${n(x)}" y="${n(cy + o.size * 0.35)}" font-family="${o.mono ? MONO : SANS}" font-size="${o.size}"${o.bold ? ' font-weight="bold"' : ""}${o.italic ? ' font-style="italic"' : ""}${o.anchor ? ` text-anchor="${o.anchor}"` : ""} fill="${o.fill}">${esc(s)}</text>`;
}

/** Several lines, `LINE_H` apart, the first one occupying y .. y + LINE_H. */
const lines = (ls: string[], x: number, y: number, o: TextOpts) => ls.map((l, i) => text(l, x, y + i * LINE_H + LINE_H / 2, o)).join("");

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = "") => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string) => `<path d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}" stroke="${stroke}"/>`;

/** A small rounded tag ("NN", enum value...) whose left edge is `x`; returns the markup and the x where the next one starts. */
function pill(label: string, x: number, lineTop: number, tone: "gray" | "enum"): [string, number] {
  const w = textWidth(label, 9, { bold: true }) + 8;
  const svg = rect(x, lineTop + 1, w, 12, tone === "enum" ? "#e0e7ff" : "#ebebeb", ' rx="3"') + text(label, x + w / 2, lineTop + LINE_H / 2, { size: 9, bold: true, anchor: "middle", fill: tone === "enum" ? "#4338ca" : "#475569" });
  return [svg, x + w + 3];
}
const pillLine = (values: string[], x: number, lineTop: number, tone: "gray" | "enum") => {
  let out = "", cx = x;
  for (const v of values) { const [s, next] = pill(v, cx, lineTop, tone); out += s; cx = next; }
  return out;
};

function tableSvg(table: TableModel, layout: TableLayout): string {
  const { x: tx, y: ty } = table;
  const W = layout.width, H = layout.height, w = layout.cols;
  const tint = mix(table.color, 9);
  const columns = new Map(allColumns(table).map((c) => [c.id, c]));
  const groups = new Map(table.items.flatMap((i) => (i.kind === "group" ? [[i.id, i] as const] : [])));
  // x of each tabular column, relative to the table.
  const order = (["key", "name", "type", "desc", "enum", "details"] as const).filter((k) => k === "key" || k === "name" || k === "type" || w[k] > 0);
  const at: Record<string, number> = {};
  order.reduce((x, k) => { at[k] = x; return x + w[k]; }, 0);

  let o = `<g transform="translate(${n(tx)} ${n(ty)})">`;
  o += `<rect width="${n(W)}" height="${n(H)}" rx="6" fill="${tint}"/>`;
  // Header: rounded on top only.
  o += `<path d="M0 ${HEADER_H}V6Q0 0 6 0H${n(W - 6)}Q${n(W)} 0 ${n(W)} 6V${HEADER_H}Z" fill="${table.color}"/>`;
  const count = allColumns(table).length;
  o += text(table.name, 12, HEADER_H / 2, { size: 14, bold: true, fill: "#fff" });
  o += text(`(${count})`, 12 + textWidth(table.name, 14, { bold: true }) + 6, HEADER_H / 2, { size: 10, fill: mix("#ffffff", 60, table.color) });

  const row = (r: LayoutRow): string => {
    const { top, height } = r;
    if (r.type === "tabledesc") return rect(0, top, W, height, mix("#000000", 4, tint)) + lines(r.lines, 12, top + 6, { size: 11, italic: true, fill: "#475569" });
    if (r.type === "empty") return text("No columns", 12, top + height / 2, { size: 12, italic: true, fill: "#94a3b8" });
    if (r.type === "group") {
      const g = groups.get(r.id)!;
      const cy = top + 8 + LINE_H / 2;
      // Triangle instead of the ▶ / ▼ glyphs, which many fonts lack.
      const tri = r.collapsed ? `M${n(11)} ${n(cy - 4)}L${n(11)} ${n(cy + 4)}L${n(17)} ${n(cy)}Z` : `M${n(10)} ${n(cy - 3)}L${n(18)} ${n(cy - 3)}L${n(14)} ${n(cy + 4)}Z`;
      return rect(0, top, W, height, mix(table.color, 20), "") + line(0, top, W, top, "#d9d9d9") + line(0, top + height, W, top + height, "#d9d9d9")
        + `<path d="${tri}" fill="#334155"/>` + text(g.name, 26, cy, { size: 12, bold: true, fill: "#334155" })
        + text(String(r.hiddenCount), W - 8, cy, { size: 12, anchor: "end", fill: "#64748b" })
        + lines(r.descLines, 26, top + 8 + LINE_H, { size: 10, italic: true, fill: "#64748b" });
    }
    const c = columns.get(r.id);
    if (!c) return "";
    const inlineExtra = w.desc === 0 && (r.descLines.length > 0 || (w.enum === 0 && r.enumLines.length > 0));
    const firstH = inlineExtra ? LINE_H + 8 : height;
    let s = line(0, top + height, W, top + height, "#e8e8e8");
    // Column separators (the type one only spans the first line when description / enum pills run under name + type).
    for (const k of order.slice(1)) s += line(at[k], top, at[k], top + (k === "type" ? firstH : height), "#ececec");
    // Key cell: PK, FK, then the attribute tags, one per line.
    let ky = top + 8;
    if (r.pk) { s += text(r.pkLabel, 4, ky + LINE_H / 2, { size: 9, bold: true, fill: "#d97706" }); ky += LINE_H; }
    if (r.fk) { s += text("FK", 4, ky + LINE_H / 2, { size: 9, bold: true, fill: "#0284c7" }); ky += LINE_H; }
    if (r.tags.length) s += pillLine(r.tags, 4, ky, "gray");
    s += text(c.name, at.name + 6, top + 8 + LINE_H / 2, { size: 12, mono: true, bold: c.primaryKey, fill: INK });
    s += text(c.dataType, at.type + 6, top + 8 + LINE_H / 2, { size: 10, mono: true, fill: "#64748b" });
    if (inlineExtra) {
      let y = top + LINE_H + 8;
      s += lines(r.descLines, at.name + 6, y, { size: 10, fill: "#94a3b8" });
      y += r.descLines.length * LINE_H;
      if (w.enum === 0) r.enumLines.forEach((l, i) => { s += pillLine(l, at.name + 6, y + i * LINE_H, "enum"); });
    }
    if (w.desc > 0) s += lines(r.descLines, at.desc + 6, top + 8, { size: 10, italic: true, fill: "#64748b" });
    if (w.enum > 0) r.enumLines.forEach((l, i) => { s += pillLine(l, at.enum + 6, top + 8 + i * LINE_H, "enum"); });
    if (w.details > 0) s += lines(r.detailLines, at.details + 6, top + 8, { size: 10, fill: "#475569" });
    return s;
  };
  o += layout.rows.map(row).join("");
  // Outline last so it also covers the square edges of the row backgrounds.
  o += `<rect width="${n(W)}" height="${n(H)}" rx="6" fill="none" stroke="#cbd5e1"/>`;
  return o + "</g>";
}

/** Crow's foot (many) or bar (one) marker at the end of a line; `side` is the table side the line attaches to. */
const crow = (p: Point, side: Side) => { const d = side === "right" ? 1 : -1; return `M${n(p.x)} ${n(p.y - 6)}L${n(p.x + d * 12)} ${n(p.y)}L${n(p.x)} ${n(p.y + 6)}M${n(p.x)} ${n(p.y)}L${n(p.x + d * 12)} ${n(p.y)}`; };
const bar = (p: Point, side: Side) => { const d = side === "right" ? 1 : -1; return `M${n(p.x + d * 8)} ${n(p.y - 6)}L${n(p.x + d * 8)} ${n(p.y + 6)}`; };

/** Returns the SVG text, or null when the design has no tables. */
export function buildSvg(data: DesignData, pad = 48): string | null {
  if (!data.tables.length) return null;
  const { settings } = data;
  const boxes = tableBoxes(data);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const grow = (x: number, y: number, w = 0, h = 0) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); };
  for (const b of boxes.values()) grow(b.x, b.y, b.w, b.h);

  let lineSvg = "", labelSvg = "";
  for (const rel of data.relationships) {
    const route: Route | null = routeRelationship(rel, data, boxes);
    if (!route) continue;
    route.points.forEach((p) => grow(p.x, p.y));
    const from = data.tables.find((t) => t.id === rel.fromTableId);
    const col = findColumn(from, rel.fromColumnId);
    const oneToOne = !!from && !!col && (isUniqueColumn(from, col) || col.primaryKey);
    const start = route.points[0], end = route.points[route.points.length - 1];
    lineSvg += `<path d="${roundedPath(route.points, settings.cornerRadius).replace(/\.(\d)\d+/g, ".$1")}" fill="none" stroke="${settings.lineColor}" stroke-width="${settings.lineWidth}" stroke-linejoin="round"/>`;
    if (settings.showMarkers) lineSvg += `<path d="${oneToOne ? bar(start, route.fromSide) : crow(start, route.fromSide)}${bar(end, route.toSide)}" fill="none" stroke="${settings.lineColor}" stroke-width="${settings.lineWidth}"/>`;
    if (settings.showLabels && rel.label) {
      const { w, h } = labelSize(rel.label);
      const shape = labelShape(w, h, route.labelDir);
      grow(route.labelAt.x - w / 2, route.labelAt.y - h / 2 - 8, w, h + 16);
      labelSvg += `<g transform="translate(${n(route.labelAt.x)} ${n(route.labelAt.y)})"><path d="${shape.path.replace(/(\d+\.\d)\d+/g, "$1")}" fill="#fff" stroke="${settings.lineColor}" stroke-width="0.75" stroke-linejoin="round"/>${text(rel.label, shape.tx, shape.ty, { size: 11, anchor: "middle", fill: "#334155" })}</g>`;
    }
  }

  const W = Math.ceil(x2 - x1 + pad * 2), H = Math.ceil(y2 - y1 + pad * 2);
  const tables = data.tables.map((t) => tableSvg(t, boxes.get(t.id)!.layout)).join("");
  // Lines first (tables hide the parts that run behind them), labels on top.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(${n(pad - x1)} ${n(pad - y1)})">${lineSvg}${tables}${labelSvg}</g></svg>\n`;
}
