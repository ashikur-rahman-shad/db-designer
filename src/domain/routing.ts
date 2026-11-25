import { GRID, snap } from "./factory";
import { tableLayout, type TableLayout } from "./layout";
import { searchedLayout } from "./search";
import { findColumn } from "./model";
import type { DesignData, LabelDirection, LabelPlacement, Point, Relationship } from "./types";

export type Side = "left" | "right";

export interface Route {
  points: Point[];
  fromSide: Side;
  toSide: Side;
  /** Axis-aligned middle segment, used as the drag handle that adjusts `bend`. */
  mid: { a: Point; b: Point };
  labelAt: Point;
  /** Unit vector the label is read along (the pointed end of the label faces this way). */
  labelDir: Point;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  layout: TableLayout;
}

/** Size of the label box drawn on a line (kept in sync with RelationshipLayer). */
export const LABEL_TIP = 8;
export const labelSize = (label: string) => ({ w: label.length * 6.4 + 8 + LABEL_TIP, h: 18 });

/**
 * Direction (unit vector, y down) in which the label of a relationship is read at point `p` of its line.
 * The line is stored from the foreign-key (child) table to the referenced (parent) table. By default the label reads
 * from the parent to the child ("customer owns institute_owner"); the design setting `labelDirection` (or the relationship's own) reverses it.
 */
export function labelReadDirection(points: Point[], p: Point, direction: LabelDirection | undefined): Point {
  let seg = points.length >= 2 ? [points[points.length - 2], points[points.length - 1]] : null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (p.x >= Math.min(a.x, b.x) - 0.5 && p.x <= Math.max(a.x, b.x) + 0.5 && p.y >= Math.min(a.y, b.y) - 0.5 && p.y <= Math.max(a.y, b.y) + 0.5) { seg = [a, b]; break; }
  }
  if (!seg) return { x: 1, y: 0 };
  const len = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y) || 1;
  const toParent = { x: (seg[1].x - seg[0].x) / len + 0, y: (seg[1].y - seg[0].y) / len + 0 };
  const d = direction === "child-to-parent" ? toParent : { x: -toParent.x, y: -toParent.y };
  return { x: d.x || 0, y: d.y || 0 }; // no -0
}

/**
 * The pointed ("pennant") label shape centred on 0,0: a rectangle whose end facing `dir` is a point (a small arrow head in the middle of the side for vertical reading). For a horizontal
 * direction the shape fills `w` x `h`; for a vertical one it is `h + LABEL_TIP` tall. `tx` / `ty` move the text to the
 * middle of the rectangular body.
 */
export function labelShape(w: number, h: number, dir: Point): { points: string; path: string; tx: number; ty: number } {
  const T = LABEL_TIP;
  const R = 4, r = 1.5; // corner radius of the rectangle's corners / of the pointed tip and arrow head
  // [x, y, radius]
  const build = (pts: number[][], tx: number, ty: number) => ({
    points: pts.map((q) => `${q[0]},${q[1]}`).join(" "),
    path: roundedPolygon(pts),
    tx, ty,
  });
  if (dir.x !== 0) {
    // Horizontal reading: a rectangle with a pointed end.
    const s = dir.x > 0 ? 1 : -1;
    const hw = w / 2, hh = h / 2;
    return build([[-s * hw, -hh, R], [s * (hw - T), -hh, R], [s * hw, 0, r], [s * (hw - T), hh, R], [-s * hw, hh, R]], -s * T / 2, 0);
  }
  // Vertical reading: the box is wide and short, so a full-width roof looks wrong. Keep a plain rectangle and mark the
  // direction with a small arrow head in the middle of the facing side (`__^__`).
  const s = dir.y > 0 ? 1 : -1;
  const hw = (w - T) / 2, hh = h / 2, B = 7, half = 7;
  return build([[-hw, -s * hh, R], [-hw, s * hh, R], [-half, s * hh, 0], [0, s * (hh + B), r], [half, s * hh, 0], [hw, s * hh, R], [hw, -s * hh, R]], 0, 0);
}

/** Closed SVG path through `[x, y, radius]` vertices, each corner rounded by its radius (limited to half the adjacent edges). */
export function roundedPolygon(pts: number[][]): string {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x, y, rad] = pts[i];
    const [px, py] = pts[(i + n - 1) % n], [nx, ny] = pts[(i + 1) % n];
    const d1 = Math.hypot(px - x, py - y), d2 = Math.hypot(nx - x, ny - y);
    const k = Math.min(rad, d1 / 2, d2 / 2);
    const a = { x: x + ((px - x) / d1) * k, y: y + ((py - y) / d1) * k };
    const b = { x: x + ((nx - x) / d2) * k, y: y + ((ny - y) / d2) * k };
    d += `${i === 0 ? "M" : "L"} ${a.x} ${a.y} ${k > 0 ? `Q ${x} ${y} ${b.x} ${b.y} ` : `L ${b.x} ${b.y} `}`;
  }
  return d + "Z";
}

const LABEL_MARGIN = 4;

export const polylineLength = (points: Point[]) => points.slice(1).reduce((s, b, i) => s + Math.hypot(b.x - points[i].x, b.y - points[i].y), 0);

const segLen = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** The point at `t` (0..1) of the way along the polyline, by length. */
export function pointAtFraction(points: Point[], t: number): Point {
  const lens = points.slice(1).map((b, i) => segLen(points[i], b));
  const total = lens.reduce((s, l) => s + l, 0);
  if (points.length === 0) return { x: 0, y: 0 };
  if (total === 0) return points[0];
  let d = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] === 0 ? 0 : Math.min(1, d / lens[i]);
      const a = points[i], b = points[i + 1];
      const r = (n: number) => Math.round(n * 1000) / 1000; // no floating-point noise in coordinates
      return { x: r(a.x + (b.x - a.x) * f), y: r(a.y + (b.y - a.y) * f) };
    }
    d -= lens[i];
  }
  return points[points.length - 1];
}

/** Where a manual label placement lands on the line (clamped to the line, so it always lies on it). */
export function placementPoint(points: Point[], pl: LabelPlacement): Point {
  const total = polylineLength(points);
  if (total === 0) return points[0] ?? { x: 0, y: 0 };
  const d = Math.min(Math.max(pl.distance, 0), total);
  return pointAtFraction(points, pl.from === "start" ? d / total : 1 - d / total);
}

/** The placement for the point of the line nearest to `p`: measured from whichever end is nearer. */
export function nearestPlacement(points: Point[], p: Point): LabelPlacement {
  const f = nearestFraction(points, p);
  const total = polylineLength(points);
  return f <= 0.5 ? { from: "start", distance: Math.round(f * total) } : { from: "end", distance: Math.round((1 - f) * total) };
}

/**
 * The fraction (0..1) along the polyline of the point nearest to `p`, with that point snapped to the grid
 * (along its segment). This is what makes a dragged label always sit exactly on the line.
 */
export function nearestFraction(points: Point[], p: Point): number {
  const lens = points.slice(1).map((b, i) => segLen(points[i], b));
  const total = lens.reduce((s, l) => s + l, 0);
  if (total === 0) return 0.5;
  let best = { dist: Infinity, frac: 0.5 };
  let cum = 0;
  points.slice(1).forEach((b, i) => {
    const a = points[i];
    const dx = b.x - a.x, dy = b.y - a.y, len = lens[i];
    if (len > 0) {
      const u = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)));
      const q = { x: a.x + dx * u, y: a.y + dy * u };
      // segments are axis-aligned: snap the coordinate that runs along the segment, staying inside it
      if (dy === 0) q.x = Math.min(Math.max(snap(q.x), Math.min(a.x, b.x)), Math.max(a.x, b.x));
      else if (dx === 0) q.y = Math.min(Math.max(snap(q.y), Math.min(a.y, b.y)), Math.max(a.y, b.y));
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      if (dist < best.dist) best = { dist, frac: (cum + segLen(a, q)) / total };
    }
    cum += len;
  });
  return Math.round(best.frac * 10000) / 10000;
}

/**
 * Tables are drawn above lines, so a label box under a table would be hidden. Keep it where it is
 * when that spot is clear; otherwise slide it along the line (longest segments first) to the first
 * spot that no table covers. Falls back to `preferred` if the whole line is covered.
 */
export function pickLabelSpot(points: Point[], label: string, tables: { x: number; y: number; w: number; h: number }[], preferred: Point): Point {
  if (!label) return preferred;
  const { w, h } = labelSize(label);
  const free = (p: Point) =>
    tables.every(
      (t) =>
        p.x + w / 2 + LABEL_MARGIN <= t.x || p.x - w / 2 - LABEL_MARGIN >= t.x + t.w ||
        p.y + h / 2 + LABEL_MARGIN <= t.y || p.y - h / 2 - LABEL_MARGIN >= t.y + t.h,
    );
  if (free(preferred)) return preferred;

  const segs = points
    .slice(1)
    .map((b, i) => ({ a: points[i], b, len: Math.abs(b.x - points[i].x) + Math.abs(b.y - points[i].y) }))
    .sort((s1, s2) => s2.len - s1.len);
  for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    for (const s of segs) {
      const p = { x: snap(s.a.x + (s.b.x - s.a.x) * f), y: snap(s.a.y + (s.b.y - s.a.y) * f) };
      if (free(p)) return p;
    }
  }
  return preferred;
}

export function tableBoxes(data: DesignData, search = ""): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const t of data.tables) {
    const layout = search ? searchedLayout(data, t, search) : tableLayout(data, t);
    out.set(t.id, { x: t.x, y: t.y, w: layout.width, h: layout.height, layout });
  }
  return out;
}

function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

/**
 * Orthogonal (never diagonal) route between two columns. All coordinates are
 * grid-aligned: the line leaves a table side horizontally, makes one vertical
 * run on a grid column, and enters the other table horizontally.
 */
export function routeRelationship(
  rel: Relationship,
  data: DesignData,
  boxes: Map<string, Box> = tableBoxes(data),
): Route | null {
  const A = boxes.get(rel.fromTableId);
  const B = boxes.get(rel.toTableId);
  if (!A || !B) return null;
  const tA = data.tables.find((t) => t.id === rel.fromTableId);
  const tB = data.tables.find((t) => t.id === rel.toTableId);
  if (!findColumn(tA, rel.fromColumnId) || !findColumn(tB, rel.toColumnId)) return null;

  const ay = A.y + (A.layout.anchorY[rel.fromColumnId] ?? snap(A.h / 2));
  const by = B.y + (B.layout.anchorY[rel.toColumnId] ?? snap(B.h / 2));
  const stub = Math.max(GRID, snap(data.settings.stubLength));
  const bend = rel.bend * GRID;

  let fromSide: Side, toSide: Side, ax: number, bx: number, xm: number;

  if (A.x + A.w + 2 * GRID <= B.x) {
    fromSide = "right"; toSide = "left";
    ax = A.x + A.w; bx = B.x;
    xm = Math.min(Math.max(snap((ax + bx) / 2) + bend, ax + GRID), bx - GRID);
  } else if (B.x + B.w + 2 * GRID <= A.x) {
    fromSide = "left"; toSide = "right";
    ax = A.x; bx = B.x + B.w;
    xm = Math.min(Math.max(snap((ax + bx) / 2) + bend, bx + GRID), ax - GRID);
  } else {
    // Horizontally overlapping tables (or self reference): loop out around the right edge, or the left one
    // when the user flipped it (`loopSide`). A positive bend always moves the run to the right.
    if (rel.loopSide === "left") {
      fromSide = "left"; toSide = "left";
      ax = A.x; bx = B.x;
      xm = Math.min(ax, bx) - Math.max(stub - bend, GRID);
    } else {
      fromSide = "right"; toSide = "right";
      ax = A.x + A.w; bx = B.x + B.w;
      xm = Math.max(ax, bx) + Math.max(stub + bend, GRID);
    }
  }

  const points = simplify([
    { x: ax, y: ay },
    { x: xm, y: ay },
    { x: xm, y: by },
    { x: bx, y: by },
  ]);
  const mid = { a: { x: xm, y: Math.min(ay, by) }, b: { x: xm, y: Math.max(ay, by) } };
  const tables = [...boxes.values()];
  if (ay === by) {
    // Straight horizontal line; handle sits in the middle of it.
    const mx = snap((ax + bx) / 2);
    const labelAt = rel.labelPos ? placementPoint(points, rel.labelPos) : pickLabelSpot(points, rel.label, tables, { x: mx, y: ay });
    return { points, fromSide, toSide, mid: { a: { x: mx, y: ay }, b: { x: mx, y: ay } }, labelAt, labelDir: labelReadDirection(points, labelAt, rel.labelDirection ?? data.settings.labelDirection) };
  }
  // A label the user placed by hand stays exactly where they put it (on the line); otherwise it is automatic.
  const labelAt = rel.labelPos ? placementPoint(points, rel.labelPos) : pickLabelSpot(points, rel.label, tables, { x: xm, y: snap((ay + by) / 2) });
  return { points, fromSide, toSide, mid, labelAt, labelDir: labelReadDirection(points, labelAt, rel.labelDirection ?? data.settings.labelDirection) };
}

/**
 * Dragging the middle run of a "C" shaped line (both ends on the same side) to world x: the line loops around the
 * side of the two tables' combined extent that the cursor is on, so dragging it past the centre flips it to the
 * opposite side. Returns the `loopSide` and `bend` (grid cells) that put the run at `x`.
 */
export function loopDrag(rel: Relationship, data: DesignData, boxes: Map<string, Box>, x: number): { loopSide: Side; bend: number } | null {
  const A = boxes.get(rel.fromTableId), B = boxes.get(rel.toTableId);
  if (!A || !B) return null;
  const minX = Math.min(A.x, B.x), maxX = Math.max(A.x + A.w, B.x + B.w);
  const stub = Math.max(GRID, snap(data.settings.stubLength));
  if (x >= (minX + maxX) / 2) return { loopSide: "right", bend: Math.round((x - maxX - stub) / GRID) };
  return { loopSide: "left", bend: Math.round((x - minX + stub) / GRID) };
}

/** SVG path through orthogonal points with rounded corners. */
export function roundedPath(pts: Point[], radius: number): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y);
    const d2 = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.max(0, Math.min(radius, d1 / 2, d2 / 2));
    if (r === 0) { d += ` L ${p.x} ${p.y}`; continue; }
    const a = { x: p.x + ((prev.x - p.x) / d1) * r, y: p.y + ((prev.y - p.y) / d1) * r };
    const b = { x: p.x + ((next.x - p.x) / d2) * r, y: p.y + ((next.y - p.y) / d2) * r };
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x);
    d += ` L ${a.x} ${a.y} A ${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last.x} ${last.y}`;
}
