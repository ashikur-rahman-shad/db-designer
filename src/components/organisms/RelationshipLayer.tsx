"use client";
import { GRID, snap } from "@/domain/factory";
import { findColumn, isUniqueColumn } from "@/domain/model";
import { labelMatches, normalizeQuery, tableMatches } from "@/domain/search";
import { labelShape, labelSize, loopDrag, nearestPlacement, roundedPath, routeRelationship, tableBoxes, type Route, type Side } from "@/domain/routing";
import type { Point, Relationship } from "@/domain/types";
import { useEditor } from "@/store/editorStore";

function Crow({ at, side }: { at: Point; side: Side }) {
  const d = side === "right" ? 1 : -1;
  return <path d={`M ${at.x} ${at.y - 6} L ${at.x + d * 12} ${at.y} L ${at.x} ${at.y + 6} M ${at.x} ${at.y} L ${at.x + d * 12} ${at.y}`} fill="none" />;
}
function Bar({ at, side }: { at: Point; side: Side }) {
  const d = side === "right" ? 1 : -1;
  return <path d={`M ${at.x + d * 8} ${at.y - 6} L ${at.x + d * 8} ${at.y + 6}`} fill="none" />;
}

/**
 * Relationship lines, drawn in two layers around the tables:
 *  - "under" (below the tables): every line and marker, and the label of every relationship except the selected one;
 *  - "over" (above everything, tables included): only the SELECTED relationship's label and its adjusting dot, so
 *    they can always be grabbed, no matter what else is on top of them.
 */
export function RelationshipLayer({
  toWorld, layer = "under",
}: { toWorld: (cx: number, cy: number) => Point; layer?: "under" | "over" }) {
  const data = useEditor((s) => s.data);
  const selection = useEditor((s) => s.selection);
  const hoverId = useEditor((s) => s.hoverRelId);
  const { select, updateRelationship, setHoverRel } = useEditor.getState();
  const { settings } = data;
  const q = normalizeQuery(useEditor((s) => s.search));
  const boxes = tableBoxes(data, q);

  const items = data.relationships.flatMap((rel) => {
    const route = routeRelationship(rel, data, boxes);
    if (!route) return [];
    const selected = selection?.type === "relationship" && selection.id === rel.id;
    const hovered = hoverId === rel.id;
    // While searching, a line stays solid only if its label matches or it touches a matching table.
    const hit = !q || labelMatches(rel.label, q) || [rel.fromTableId, rel.toTableId].some((id) => { const t = data.tables.find((x) => x.id === id); return !!t && tableMatches(t, q); });
    return [{
      rel, route, selected, hovered, dim: !hit && !selected, labelHit: !!q && labelMatches(rel.label, q),
      stroke: selected ? "#2563eb" : hovered ? "#3b82f6" : settings.lineColor,
      pick: (e: React.PointerEvent) => { e.stopPropagation(); select({ type: "relationship", id: rel.id }); },
      enter: () => setHoverRel(rel.id),
      leave: () => { if (useEditor.getState().hoverRelId === rel.id) setHoverRel(null); },
    }];
  });
  type Item = (typeof items)[number];

  /** Drag the adjusting dot: moves the middle run of the line sideways (stored as `bend`). */
  const startBendDrag = (e: React.PointerEvent, relId: string, route: Route, bend: number) => {
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const baseXm = route.mid.a.x;
    const isLoop = route.fromSide === route.toSide;
    const move = (ev: PointerEvent) => {
      const x = snap(toWorld(ev.clientX, ev.clientY).x);
      if (isLoop) {
        // "C" shaped line: following the cursor past the centre of the two tables flips the line to the other side.
        const d = useEditor.getState().data;
        const rel = d.relationships.find((r) => r.id === relId);
        const r = rel && loopDrag(rel, d, tableBoxes(d, q), x);
        if (r) updateRelationship(relId, r);
        return;
      }
      updateRelationship(relId, { bend: bend + Math.round((x - baseXm) / GRID) });
    };
    const up = () => { el.removeEventListener("pointermove", move as EventListener); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up);
  };

  /**
   * Press on a label selects the relationship; dragging moves the label ALONG the line (its centre is always on
   * the line, snapped to the grid). Window listeners are used because selecting moves the label from the "under"
   * layer to the "over" layer, which replaces the element mid-gesture.
   */
  const startLabelDrag = (e: React.PointerEvent, it: Item) => {
    it.pick(e);
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      moved = true;
      updateRelationship(it.rel.id, { labelPos: nearestPlacement(it.route.points, toWorld(ev.clientX, ev.clientY)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = prevSelect;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const label = (it: Item) => {
    const { rel, route, selected, hovered, stroke, enter, leave, dim, labelHit } = it;
    const { w, h } = labelSize(rel.label);
    const shape = labelShape(w, h, route.labelDir);
    return (
      <g
        key={`label-${rel.id}`}
        data-rel-label={rel.id}
        transform={`translate(${route.labelAt.x} ${route.labelAt.y})`}
        style={{ pointerEvents: "all", cursor: selected ? "grab" : "pointer", opacity: dim ? 0.2 : 1 }}
        onPointerDown={(e) => startLabelDrag(e, it)} onPointerEnter={enter} onPointerLeave={leave}
      >
        <path
          d={shape.path}
          fill={selected ? "#dbeafe" : labelHit ? "#fde047" : hovered ? "#eff6ff" : "white"} stroke={stroke} strokeWidth={selected || hovered ? 1.25 : 0.75} strokeLinejoin="round"
        />
        <text x={shape.tx} y={shape.ty} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={selected ? "#1d4ed8" : "#334155"} style={{ pointerEvents: "none", userSelect: "none" }}>{rel.label}</text>
      </g>
    );
  };

  const svgClass = "pointer-events-none absolute left-0 top-0 overflow-visible";

  // ---- top layer: the selected relationship's label + adjusting dot --------------------------------------------
  if (layer === "over") {
    const sel = items.find((i) => i.selected);
    if (!sel) return null;
    const { rel, route } = sel;
    const hasHandle = route.mid.a.y !== route.mid.b.y;
    // Upper part of the run, so the dot never sits on the label's default (middle) spot.
    const hx = route.mid.a.x, hy = snap(route.mid.a.y + (route.mid.b.y - route.mid.a.y) * 0.25);
    return (
      <svg className={`${svgClass} z-20`} width={1} height={1}>
        {settings.showLabels && rel.label && label(sel)}
        {hasHandle && (
          <rect
            data-rel-handle={rel.id}
            x={hx - 6} y={hy - 6} width={12} height={12} rx={3}
            fill="#2563eb" stroke="white" strokeWidth={1.5}
            style={{ pointerEvents: "all", cursor: "ew-resize" }}
            onPointerDown={(e) => startBendDrag(e, rel.id, route, rel.bend)}
          />
        )}
      </svg>
    );
  }

  // ---- under the tables: all lines, then the labels of the other relationships ---------------------------------
  return (
    <svg className={svgClass} width={1} height={1}>
      {items.map(({ rel, route, selected, hovered, stroke, pick, enter, leave, dim }) => {
        const d = roundedPath(route.points, settings.cornerRadius);
        const fromTable = data.tables.find((t) => t.id === rel.fromTableId);
        const fromCol = findColumn(fromTable, rel.fromColumnId);
        const oneToOne = !!fromTable && !!fromCol && (isUniqueColumn(fromTable, fromCol) || fromCol.primaryKey);
        const start = route.points[0], end = route.points[route.points.length - 1];
        return (
          <g key={rel.id} opacity={dim ? 0.2 : 1}>
            <path
              d={d} fill="none" stroke="transparent" strokeWidth={12}
              className="pointer-events-stroke cursor-pointer" style={{ pointerEvents: "stroke" }}
              onPointerDown={pick} onPointerEnter={enter} onPointerLeave={leave}
            />
            <path d={d} fill="none" stroke={stroke} strokeWidth={selected || hovered ? settings.lineWidth + 1 : settings.lineWidth} strokeLinejoin="round" />
            {settings.showMarkers && (
              <g stroke={stroke} strokeWidth={settings.lineWidth}>
                {oneToOne ? <Bar at={start} side={route.fromSide} /> : <Crow at={start} side={route.fromSide} />}
                <Bar at={end} side={route.toSide} />
              </g>
            )}
          </g>
        );
      })}
      {settings.showLabels && items.filter((it) => !it.selected && it.rel.label).map(label)}
    </svg>
  );
}

export type { Relationship };
