/**
 * Export to draw.io (`.drawio`, uncompressed mxfile XML). Lucidchart imports this format natively
 * (Lucidchart: Import Data → Diagramming → draw.io), as does diagrams.net.
 *
 * Laid out exactly as on the canvas:
 *  - every table = a body rectangle, a header, one rectangle per row (group / column / description) and text cells;
 *  - every relationship = an orthogonal edge connected to the cell of its column, with the design's colour / width,
 *    native ER crow's-foot / one end markers and the label. The connection points follow the canvas routing.
 */
import { tableLayout, HEADER_H, LINE_H, type LayoutRow } from "@/domain/layout";
import { allColumns } from "@/domain/model";
import { routeRelationship, tableBoxes } from "@/domain/routing";
import type { DesignData, DesignMeta, TableModel } from "@/domain/types";

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** `color-mix(in srgb, color pct%, white)` for a #rgb / #rrggbb colour (other values are returned unchanged). */
export function tint(color: string, pct: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const mix = (i: number) => hex2(parseInt(h.slice(i, i + 2), 16) * (pct / 100) + 255 * (1 - pct / 100));
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/** Escape text for an HTML label. */
const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Escape a string for use as an XML attribute value (same escapes as draw.io). */
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\n/g, "&#xa;");
const span = (css: string, s: string) => `<span style="${css}">${s}</span>`;
const [I3, I4, I5, I6] = [8, 10, 12, 14].map((n) => " ".repeat(n));
const hexColor = (c: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim() : "#000000");
const clamp01 = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));

function buildCells(meta: DesignMeta, data: DesignData): string {
  const { settings } = data;
  const boxes = tableBoxes(data, "");
  const PAD = 48;
  const all = [...boxes.values()];
  const ox = PAD - (all.length ? Math.min(...all.map((b) => b.x)) : 0);
  const oy = PAD - (all.length ? Math.min(...all.map((b) => b.y)) : 0);

  const cells: string[] = [];
  const anchor = new Map<string, { id: string; top: number; h: number }>();
  let n = 1;
  const nextId = () => `c${++n}`;

  const cell = (x: number, y: number, w: number, h: number, style: string, value = "", extra = ""): string => {
    const id = nextId();
    cells.push(
      `${I3}<mxCell id="${id}" parent="1" style="${attr(style)}" value="${attr(value)}" vertex="1"${extra}>\n` +
        `${I4}<mxGeometry height="${Math.round(h)}" width="${Math.round(w)}" x="${Math.round(x)}" y="${Math.round(y)}" as="geometry" />\n${I3}</mxCell>`,
    );
    return id;
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string | null, stroke: string | null, value = "", extra = "") =>
    cell(x, y, w, h, `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill ?? "none"};strokeColor=${stroke ?? "none"};align=left;verticalAlign=middle;${extra || "spacingLeft=4;"}`, value);
  const text = (x: number, y: number, w: number, h: number, value: string, css = "") =>
    cell(x, y, w, h, `text;html=1;whiteSpace=wrap;overflow=hidden;align=left;verticalAlign=middle;spacing=0;${css}`, value);

  for (const t of data.tables) {
    const box = boxes.get(t.id)!;
    const L = box.layout;
    const x = box.x + ox, y = box.y + oy, w = L.width, h = L.height;
    const color = hexColor(t.color);

    rect(x, y, w, h, tint(color, 9), "#cbd5e1");
    const header = rect(x, y, w, HEADER_H, color, color,
      `<b>${html(t.name)}</b> ${span("font-size:10px;opacity:0.65", `(${allColumns(t).length})`)}`,
      "fontColor=#ffffff;fontSize=14;spacingLeft=8;");
    // Columns the current view hides (logical view…) attach to the header.
    for (const c of allColumns(t)) anchor.set(c.id, { id: header, top: y, h: HEADER_H });

    for (const row of L.rows) rowCells(t, row, x, y + row.top, w, L.cols);
  }

  function rowCells(t: TableModel, row: LayoutRow, x: number, ry: number, w: number, cx: { key: number; name: number; type: number }) {
    if (row.type === "tabledesc") {
      rect(x, ry, w, row.height, "#f1f1f1", null);
      text(x + 12, ry, w - 24, row.height, row.lines.map(html).join("<br>"), "fontSize=11;fontStyle=2;fontColor=#475569;");
      return;
    }
    if (row.type === "empty") {
      text(x + 12, ry, w - 24, row.height, "No columns", "fontSize=12;fontStyle=2;fontColor=#94a3b8;");
      return;
    }
    if (row.type === "group") {
      const g = t.items.find((i) => i.kind === "group" && i.id === row.id);
      const gid = rect(x, ry, w, row.height, tint(hexColor(t.color), 20), "#d9d9d9");
      text(x + 8, ry, w - 40, Math.min(row.height, 30), `${row.collapsed ? "▶" : "▼"}&nbsp; <b>${html(g?.name ?? "")}</b>`, "fontSize=12;fontColor=#334155;");
      text(x + w - 40, ry, 32, Math.min(row.height, 30), String(row.hiddenCount), "fontSize=12;align=right;fontColor=#64748b;");
      if (row.descLines.length) text(x + 26, ry + 24, w - 34, row.height - 24, row.descLines.map(html).join("<br>"), "fontSize=10;fontStyle=2;fontColor=#64748b;");
      if (g?.kind === "group") for (const c of g.columns) anchor.set(c.id, { id: gid, top: ry, h: row.height });
      return;
    }
    const col = allColumns(t).find((c) => c.id === row.id);
    if (!col) return;
    const rid = rect(x, ry, w, row.height, null, "#e5e7eb");
    anchor.set(col.id, { id: rid, top: ry, h: row.height });
    const inlineExtra = row.descLines.length > 0 || row.enumLines.length > 0;
    const first = inlineExtra ? LINE_H + 8 : row.height;

    const keys: string[] = [];
    if (row.pk) keys.push(span("font-size:9px;font-weight:bold;color:#d97706", html(row.pkLabel)));
    if (row.fk) keys.push(span("font-size:9px;font-weight:bold;color:#0284c7", "FK"));
    if (row.tags.length) keys.push(span("font-size:9px;font-weight:bold;color:#475569", row.tags.map(html).join(" ")));
    if (keys.length) text(x + 2, ry, cx.key - 2, row.height, keys.join("<br>"));
    text(x + cx.key, ry, cx.name, first, html(col.name), `fontFamily=Courier New;fontSize=12;fontColor=#0f172a;${col.primaryKey ? "fontStyle=1;" : ""}`);
    text(x + cx.key + cx.name, ry, cx.type, first, html(col.dataType), "fontFamily=Courier New;fontSize=10;fontColor=#64748b;");
    if (inlineExtra) {
      const extra = [
        ...row.descLines.map((l) => span("font-size:10px;color:#94a3b8", html(l))),
        ...row.enumLines.map((l) => span("font-size:9px;font-weight:bold;color:#4338ca", l.map((v) => `[${html(v)}]`).join(" "))),
      ];
      text(x + cx.key, ry + first, cx.name + cx.type, row.height - first, extra.join("<br>"));
    }
  }

  // ---- relationships ----------------------------------------------------------------------------------------------
  const lineColor = hexColor(settings.lineColor);
  for (const rel of data.relationships) {
    const route = routeRelationship(rel, data, boxes);
    const a = anchor.get(rel.fromColumnId), b = anchor.get(rel.toColumnId);
    if (!route || !a || !b) continue;
    const fromTable = data.tables.find((t) => t.id === rel.fromTableId)!;
    const fromCol = allColumns(fromTable).find((c) => c.id === rel.fromColumnId)!;
    const oneToOne = fromCol.primaryKey || fromCol.unique || fromTable.indexes.some((ix) => ix.unique && ix.columnIds.length === 1 && ix.columnIds[0] === fromCol.id);
    const start = route.points[0], end = route.points[route.points.length - 1];
    const sy = clamp01((start.y + oy - a.top) / a.h), ey = clamp01((end.y + oy - b.top) / b.h);
    const style = [
      "edgeStyle=orthogonalEdgeStyle", "rounded=0", "html=1", "jettySize=auto", "orthogonalLoop=1",
      `strokeColor=${lineColor}`, `strokeWidth=${settings.lineWidth}`, 
      `exitX=${route.fromSide === "right" ? 1 : 0}`, `exitY=${sy}`, "exitDx=0", "exitDy=0", "exitPerimeter=0",
      `entryX=${route.toSide === "right" ? 1 : 0}`, `entryY=${ey}`, "entryDx=0", "entryDy=0", "entryPerimeter=0",
      `startArrow=${settings.showMarkers ? (oneToOne ? "ERone" : "ERmany") : "none"}`, "startFill=0",
      `endArrow=${settings.showMarkers ? "ERone" : "none"}`, "endFill=0",
    ].join(";");
    // Waypoints = the canvas route, so draw.io draws the same path and the label's position along it is exact.
    const mid = route.points.slice(1, -1);
    const bends = mid.length ? `\n${I5}<Array as="points">\n${mid.map((p) => `${I6}<mxPoint x="${Math.round(p.x + ox)}" y="${Math.round(p.y + oy)}" />`).join("\n")}\n${I5}</Array>\n${I4}` : "";
    const label = settings.showLabels && rel.label.trim() ? html(rel.label) : "";
    cells.push(
      `${I3}<mxCell id="${nextId()}" edge="1" parent="1" source="${a.id}" style="${attr(style)}" target="${b.id}" value="">\n` +
        `${I4}<mxGeometry relative="1" as="geometry"${bends ? `>${bends}</mxGeometry>` : " />"}\n${I3}</mxCell>`,
    );
    // The label is floating text on top of the line (draw.io / Lucid place native edge labels differently), centred
    // where the label sits on the canvas. Added after the line so it is drawn above it.
    if (label) {
      const lw = Math.ceil(rel.label.trim().length * 6.3) + 12, lh = 18;
      cell(route.labelAt.x + ox - lw / 2, route.labelAt.y + oy - lh / 2, lw, lh,
        "text;html=1;whiteSpace=nowrap;align=center;verticalAlign=middle;spacing=0;fontSize=11;fillColor=#ffffff;strokeColor=none;", label);
    }
  }

  return cells.join("\n");
}

/**
 * Written exactly the way draw.io itself saves a file (pretty-printed, sorted attributes, `<mxfile host agent>` only):
 * Lucidchart's importer rejects the same content in any other shape ("not a valid draw.io file").
 */
export function buildDrawioXml(meta: DesignMeta, data: DesignData): string {
  const name = attr(meta.name.trim() || "Design");
  return [
    `<mxfile host="Electron" agent="DB Designer">`,
    `  <diagram id="page1" name="${name}">`,
    `    <mxGraphModel dx="1200" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">`,
    `      <root>`,
    `        <mxCell id="0" />`,
    `        <mxCell id="1" parent="0" />`,
    buildCells(meta, data),
    `      </root>`,
    `    </mxGraphModel>`,
    `  </diagram>`,
    `</mxfile>`,
    "",
  ].join("\n");
}
