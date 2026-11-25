"use client";
import { useRef, useState } from "react";
import { tableLayout } from "@/domain/layout";
import type { Column, ColumnGroup, TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { IconButton } from "../atoms/IconButton";
import { SelectInput } from "../atoms/SelectInput";
import { TextArea } from "../atoms/TextArea";
import { TextInput } from "../atoms/TextInput";
import { ColorPicker } from "../molecules/ColorPicker";
import { Field } from "../molecules/Field";
import { ConnectedColumnEditor } from "./ConnectedColumnEditor";
import { Indexes } from "./Indexes";
import { TableGroupField } from "./TableGroupField";

type Drag = { type: "column" | "group"; id: string };
type Hint = { id: string; pos: "before" | "after" | "into" };
type Plan = { container: string | null; before: string | null };

const HINT_CLASS: Record<Hint["pos"], string> = {
  before: "shadow-[0_-3px_0_0_#2563eb]",
  after: "shadow-[0_3px_0_0_#2563eb]",
  into: "ring-2 ring-blue-500 rounded-md",
};

export function TablePropertiesPanel({ table }: { table: TableModel }) {
  const data = useEditor((s) => s.data);
  const st = useEditor.getState();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const plan = useRef<Plan | null>(null);
  // Mirrors `drag` synchronously: dragover can fire before React re-renders with the new state.
  const dragRef = useRef<Drag | null>(null);

  const groups = table.items.filter((i): i is ColumnGroup => i.kind === "group");

  // ---- drag & drop ----------------------------------------------------------
  const info = new Map<string, { kind: "column" | "group"; container: string | null; siblings: string[] }>();
  const rootIds = table.items.map((i) => i.id);
  for (const i of table.items) {
    info.set(i.id, { kind: i.kind, container: null, siblings: rootIds });
    if (i.kind === "group") {
      const ids = i.columns.map((c) => c.id);
      i.columns.forEach((c) => info.set(c.id, { kind: "column", container: i.id, siblings: ids }));
    }
  }
  const nextOf = (id: string) => {
    const sib = info.get(id)!.siblings;
    return sib[sib.indexOf(id) + 1] ?? null;
  };

  const reset = () => { dragRef.current = null; setDrag(null); setHint(null); plan.current = null; };
  const accept = (e: React.DragEvent, h: Hint, p: Plan) => {
    e.preventDefault();
    e.stopPropagation();
    plan.current = p;
    setHint((cur) => (cur && cur.id === h.id && cur.pos === h.pos ? cur : h));
  };

  /** Hovering over an existing column / group header. */
  const over = (overId: string, e: React.DragEvent) => {
    const o = info.get(overId);
    const drag = dragRef.current;
    if (!drag || !o || overId === drag.id) return;
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientY - r.top) / r.height;
    if (drag.type === "group") {
      const topId = o.container ?? overId;
      if (topId === drag.id) return;
      const after = rel >= 0.5;
      return accept(e, { id: topId, pos: after ? "after" : "before" }, { container: null, before: after ? nextOf(topId) : topId });
    }
    if (o.kind === "group") {
      if (rel < 0.25) return accept(e, { id: overId, pos: "before" }, { container: null, before: overId });
      const g = groups.find((x) => x.id === overId)!;
      return accept(e, { id: overId, pos: "into" }, { container: overId, before: g.columns[0]?.id ?? null });
    }
    const after = rel >= 0.5;
    accept(e, { id: overId, pos: after ? "after" : "before" }, { container: o.container, before: after ? nextOf(overId) : overId });
  };

  /** Hovering over the "append here" zone at the end of the table or of a group. */
  const overEnd = (container: string | null, e: React.DragEvent) => {
    const drag = dragRef.current;
    if (!drag || (drag.type === "group" && container)) return;
    accept(e, { id: `end:${container ?? "root"}`, pos: "into" }, { container, before: null });
  };

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragRef.current;
    if (drag && plan.current) st.moveNode(table.id, drag.id, plan.current.container, plan.current.before);
    reset();
  };

  const startDrag = (d: Drag) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", d.id);
    const row = (e.currentTarget as HTMLElement).closest("[data-dnd-row]");
    if (row) e.dataTransfer.setDragImage(row, 12, 12);
    dragRef.current = d;
    setDrag(d);
  };

  const hc = (id: string) => (hint?.id === id ? HINT_CLASS[hint.pos] : "");

  const renderColumn = (c: Column, siblings: { id: string }[], groupId: string) => (
    <div
      key={c.id}
      data-dnd-row
      onDragOver={(e) => over(c.id, e)}
      onDrop={drop}
      className={`${hc(c.id)} ${drag?.id === c.id ? "opacity-40" : ""}`}
    >
      <ConnectedColumnEditor
        table={table}
        column={c}
        siblings={siblings}
        groupId={groupId}
        onHandleDragStart={startDrag({ type: "column", id: c.id })}
        onHandleDragEnd={reset}
      />
    </div>
  );

  return (
    <div className="space-y-4" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHint(null); }}>
      <div className="space-y-3">
        <Field label="Table name">
          <TextInput value={table.name} onChange={(e) => st.updateTable(table.id, { name: e.target.value })} className="mono font-semibold" />
        </Field>
        <Field label="Description">
          <TextArea value={table.description} onChange={(e) => st.updateTable(table.id, { description: e.target.value })} placeholder="What does this table store?" />
        </Field>
        <Field label="Color">
          <ColorPicker value={table.color} onChange={(color) => st.updateTable(table.id, { color })} />
        </Field>
        <TableGroupField table={table} />
        <Field label="Width">
          <div className="flex items-center gap-2">
            <SelectInput
              value={table.autoWidth ? "auto" : "fixed"}
              onChange={(e) =>
                st.updateTable(table.id, e.target.value === "auto"
                  ? { autoWidth: true }
                  : { autoWidth: false, width: tableLayout(data, table).width })
              }
              aria-label="Width mode"
            >
              <option value="auto">Auto (fits content)</option>
              <option value="fixed">Fixed</option>
            </SelectInput>
            {!table.autoWidth && (
              <TextInput
                type="number" min={160} step={10} value={table.width} aria-label="Fixed width in px"
                onChange={(e) => st.updateTable(table.id, { width: Math.max(160, Math.round(Number(e.target.value) / 10) * 10 || 240) })}
                className="!w-24"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">Dragging the table&apos;s right edge switches it to a fixed width.</p>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Columns</h3>
        <Button size="sm" className="ml-auto" onClick={() => st.addColumn(table.id)}>+ Column</Button>
        <Button size="sm" onClick={() => st.addGroup(table.id)}>+ Group</Button>
      </div>

      <div className="space-y-2">
        {table.items.map((item, idx) =>
          item.kind === "column" ? (
            renderColumn(item, table.items.filter((i) => i.kind === "column"), "")
          ) : (
            <div key={item.id} data-dnd-row className={`rounded-md border border-indigo-200 bg-indigo-50/50 p-1.5 ${drag?.id === item.id ? "opacity-40" : ""}`}>
              <div onDragOver={(e) => over(item.id, e)} onDrop={drop} className={`rounded-md ${hc(item.id)}`}>
                <div className="flex items-center gap-1">
                  <span
                    draggable
                    onDragStart={startDrag({ type: "group", id: item.id })}
                    onDragEnd={reset}
                    title="Drag to reorder the group"
                    className="cursor-grab select-none px-0.5 text-slate-400 hover:text-slate-700 active:cursor-grabbing"
                  >⋮⋮</span>
                  <IconButton onClick={() => st.updateGroup(table.id, item.id, { collapsed: !item.collapsed })} aria-label="Toggle group" title="Collapse / expand on the diagram">
                    {item.collapsed ? "▶" : "▼"}
                  </IconButton>
                  <TextInput value={item.name} onChange={(e) => st.updateGroup(table.id, item.id, { name: e.target.value })} aria-label="Group name" className="font-semibold" />
                  <IconButton disabled={idx === 0} onClick={() => st.moveItem(table.id, item.id, -1)} aria-label="Move group up">▲</IconButton>
                  <IconButton disabled={idx === table.items.length - 1} onClick={() => st.moveItem(table.id, item.id, 1)} aria-label="Move group down">▼</IconButton>
                  <IconButton onClick={() => st.deleteGroup(table.id, item.id)} aria-label="Delete group (keeps columns)" title="Delete group (columns are kept)" className="hover:!bg-red-100 hover:!text-red-600">✕</IconButton>
                </div>
                <TextArea
                  value={item.description} placeholder="Group description"
                  onChange={(e) => st.updateGroup(table.id, item.id, { description: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="mt-1.5 space-y-1.5 border-l-2 border-indigo-200 pl-2">
                {item.columns.map((c) => renderColumn(c, item.columns, item.id))}
                <div
                  onDragOver={(e) => overEnd(item.id, e)}
                  onDrop={drop}
                  className={`flex min-h-8 items-center rounded-md border border-dashed ${hc(`end:${item.id}`)} ${drag?.type === "column" ? "border-indigo-300" : "border-transparent"}`}
                >
                  <Button size="sm" variant="ghost" onClick={() => st.addColumn(table.id, item.id)}>+ Column in group</Button>
                  {drag?.type === "column" && <span className="ml-auto pr-2 text-[11px] text-indigo-400">drop to add to group</span>}
                </div>
              </div>
            </div>
          ),
        )}
        {table.items.length === 0 && <p className="text-sm italic text-slate-400">No columns yet.</p>}
        {drag && (
          <div
            onDragOver={(e) => overEnd(null, e)}
            onDrop={drop}
            className={`flex min-h-8 items-center justify-center rounded-md border border-dashed border-slate-300 text-[11px] text-slate-400 ${hc("end:root")}`}
          >
            drop here for end of table (outside any group)
          </div>
        )}
      </div>

      <Indexes table={table} />

      <Button variant="danger" className="w-full" onClick={() => confirm(`Delete table “${table.name}”?`) && st.deleteTable(table.id)}>
        Delete table
      </Button>
    </div>
  );
}
