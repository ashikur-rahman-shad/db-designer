"use client";
import type { Column, TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { ConnectedColumnEditor } from "./ConnectedColumnEditor";
import { Indexes } from "./Indexes";

/** Properties of one column only (shown when a column row is clicked on the canvas). */
export function ColumnPropertiesPanel({ table, column }: { table: TableModel; column: Column }) {
  const st = useEditor.getState();
  const group = table.items.find((i) => i.kind === "group" && i.columns.some((c) => c.id === column.id));
  const siblings = group && group.kind === "group" ? group.columns : table.items.filter((i) => i.kind === "column");
  const selectTable = () => st.select({ type: "table", id: table.id });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Column in</span>
        <button type="button" onClick={selectTable} className="mono font-semibold text-blue-600 hover:underline" title="Show all properties of the table">
          {table.name}
        </button>
        {group && group.kind === "group" && <span>· group <b>{group.name}</b></span>}
      </div>
      <ConnectedColumnEditor
        key={column.id}
        table={table}
        column={column}
        siblings={siblings}
        groupId={group?.id ?? ""}
        defaultOpen
        onDeleted={selectTable}
      />
      <Indexes table={table} onlyColumnIds={[column.id]} newIndexColumnIds={[column.id]} />
      <Button size="sm" onClick={selectTable}>All table properties</Button>
    </div>
  );
}
