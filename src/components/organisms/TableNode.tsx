"use client";
import { useRef } from "react";
import { snap } from "@/domain/factory";
import { normalizeQuery, searchedLayout, tableMatches } from "@/domain/search";
import type { TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { TableCard } from "./TableCard";

export function TableNode({ table }: { table: TableModel }) {
  const data = useEditor((s) => s.data);
  const sel = useEditor((s) => s.selection);
  const tableSelected = (sel?.type === "table" && sel.id === table.id) || (sel?.type === "tables" && sel.ids.includes(table.id));
  // A selected column / group of this table is highlighted; the table gets a lighter outline.
  const partId = (sel?.type === "column" || sel?.type === "group") && sel.tableId === table.id ? sel.id : null;
  const zoom = useEditor((s) => s.view.zoom);
  const { select, toggleTableSelection, moveTables, updateTable, updateGroup, openDetail } = useEditor.getState();
  // Dragging a header moves every selected table together (starts = their positions when the drag began).
  const drag = useRef<{ px: number; py: number; moved: boolean; collapseTo: string | null; starts: { id: string; x: number; y: number }[] } | null>(null);
  const resize = useRef<{ px: number; w: number; x: number } | null>(null);

  const q = normalizeQuery(useEditor((s) => s.search));
  const layout = searchedLayout(data, table, q);
  // The selected table is raised above the others while it stays selected (view-only; never saved).
  const dimmed = !!q && !tableMatches(table, q);

  return (
    <div
      // Each part selects itself (header / description -> table, row -> column / group); the node only keeps the canvas from panning.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={() => openDetail(table.id)}
      className={`absolute overflow-hidden rounded-md shadow-md ${tableSelected ? "ring-2 ring-blue-500" : partId ? "ring-2 ring-blue-300" : "ring-1 ring-slate-300"}`}
      style={{ left: table.x, top: table.y, width: layout.width, height: layout.height, opacity: dimmed ? 0.25 : 1, zIndex: tableSelected || partId ? 10 : q ? (dimmed ? 0 : 1) : undefined }}
    >
      <TableCard
        table={table}
        layout={layout}
        highlight={q}
        selectedId={partId}
        onSelect={(t, e) => {
          if (e.ctrlKey || e.metaKey) return toggleTableSelection(table.id); // Ctrl/Cmd+click: add to / remove from the selection
          select(t.kind === "table" ? { type: "table", id: table.id } : { type: t.kind, tableId: table.id, id: t.id });
        }}
        onToggleGroup={(id, collapsed) => updateGroup(table.id, id, { collapsed })}
        headerProps={{
          className: "cursor-grab select-none active:cursor-grabbing",
          onPointerDown: (e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) { toggleTableSelection(table.id); return; } // no drag on Ctrl+click
            const st = useEditor.getState();
            const multi = st.selection?.type === "tables" && st.selection.ids.includes(table.id) ? st.selection.ids : null;
            if (!multi) select({ type: "table", id: table.id }); // pressing a table of a multi-selection keeps it, so all can be dragged
            const ids = multi ?? [table.id];
            drag.current = {
              px: e.clientX, py: e.clientY, moved: false, collapseTo: multi ? table.id : null,
              starts: st.data.tables.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, x: t.x, y: t.y })),
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          },
          onPointerMove: (e) => {
            const d = drag.current;
            if (!d) return;
            const dx = (e.clientX - d.px) / zoom, dy = (e.clientY - d.py) / zoom;
            if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
            moveTables(d.starts.map((s) => ({ id: s.id, x: s.x + dx, y: s.y + dy })));
          },
          onPointerUp: () => {
            const d = drag.current;
            drag.current = null;
            // a plain click (no drag) on a table of a multi-selection selects just that table
            if (d && !d.moved && d.collapseTo) select({ type: "table", id: d.collapseTo });
          },
        }}
      />
      {/* Edge handles: drag to resize the width (snaps to the grid). The left handle keeps the right edge fixed. */}
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          title="Drag to set a fixed width"
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            select({ type: "table", id: table.id });
            resize.current = { px: e.clientX, w: layout.width, x: table.x };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const r = resize.current;
            if (!r) return;
            const dx = (e.clientX - r.px) / zoom;
            if (side === "right") {
              updateTable(table.id, { autoWidth: false, width: Math.max(160, snap(r.w + dx)) });
            } else {
              const width = Math.max(160, snap(r.w - dx));
              updateTable(table.id, { autoWidth: false, width, x: r.x + r.w - width });
            }
          }}
          onPointerUp={() => { resize.current = null; }}
          className={`absolute top-0 z-10 h-full w-2 cursor-ew-resize hover:bg-blue-500/30 ${side === "left" ? "left-0" : "right-0"}`}
        />
      ))}
    </div>
  );
}
