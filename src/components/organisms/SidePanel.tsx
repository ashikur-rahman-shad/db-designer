"use client";
import { useEditor } from "@/store/editorStore";
import { IconButton } from "../atoms/IconButton";
import { findColumn } from "@/domain/model";
import { ColumnPropertiesPanel } from "./ColumnPropertiesPanel";
import { GroupPropertiesPanel } from "./GroupPropertiesPanel";
import { MultiTablePanel } from "./MultiTablePanel";
import { RelationshipPanel } from "./RelationshipPanel";
import { TablePropertiesPanel } from "./TablePropertiesPanel";

export function SidePanel() {
  const selection = useEditor((s) => s.selection);
  const data = useEditor((s) => s.data);
  const open = useEditor((s) => s.panelOpen);
  const viewing = useEditor((s) => s.viewing);
  const select = useEditor.getState().select;
  if (!open) return null;

  const table = selection?.type === "table" ? data.tables.find((t) => t.id === selection.id) : undefined;
  const multi = selection?.type === "tables" ? data.tables.filter((t) => selection.ids.includes(t.id)) : [];
  const partTable = selection?.type === "column" || selection?.type === "group" ? data.tables.find((t) => t.id === selection.tableId) : undefined;
  const column = selection?.type === "column" ? findColumn(partTable, selection.id) : undefined;
  const group = selection?.type === "group" ? partTable?.items.find((i) => i.kind === "group" && i.id === selection.id) : undefined;
  const rel = selection?.type === "relationship" ? data.relationships.find((r) => r.id === selection.id) : undefined;

  return (
    <aside aria-label="Properties panel" className="scroll-thin w-96 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center border-b border-slate-200 pb-2">
        <h2 className="text-sm font-bold">Properties</h2>
        <IconButton className="ml-auto" onClick={() => useEditor.getState().setPanelOpen(false)} title="Hide Properties panel (Ctrl/⌘+B)" aria-label="Hide Properties panel">✕</IconButton>
      </div>
      {viewing && (table || rel || column || group || multi.length > 1) && (
        <p className="mb-3 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Version {viewing.version} is read-only.</p>
      )}
      {multi.length > 1 ? (
        <fieldset disabled={!!viewing} className="contents"><MultiTablePanel tables={multi} /></fieldset>
      ) : table ? (
        // A disabled fieldset disables every input and button inside it.
        <fieldset disabled={!!viewing} className="contents"><TablePropertiesPanel key={table.id} table={table} /></fieldset>
      ) : partTable && column ? (
        <fieldset disabled={!!viewing} className="contents"><ColumnPropertiesPanel key={column.id} table={partTable} column={column} /></fieldset>
      ) : partTable && group && group.kind === "group" ? (
        <fieldset disabled={!!viewing} className="contents"><GroupPropertiesPanel key={group.id} table={partTable} group={group} /></fieldset>
      ) : rel ? (
        <fieldset disabled={!!viewing} className="contents"><RelationshipPanel key={rel.id} rel={rel} /></fieldset>
      ) : (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tables ({data.tables.length})</h3>
          <ul className="space-y-1">
            {data.tables.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => select({ type: "table", id: t.id })}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  <span className="h-3 w-3 rounded-sm" style={{ background: t.color }} />
                  <span className="mono truncate">{t.name}</span>
                  {t.groupId && <span className="ml-auto truncate text-xs text-slate-400">{data.tableGroups.find((g) => g.id === t.groupId)?.name}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-400">Select a table or a relationship line on the canvas to edit it.</p>
        </div>
      )}
    </aside>
  );
}
