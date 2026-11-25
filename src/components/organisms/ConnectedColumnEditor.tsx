"use client";
import { allColumns, isUniqueColumn, relationshipFor } from "@/domain/model";
import type { Column, TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { ColumnEditor, type FkOption } from "../molecules/ColumnEditor";

/** A ColumnEditor wired to the store (used for the full table view and the single-column view). */
export function ConnectedColumnEditor({
  table, column, siblings, groupId, onHandleDragStart, onHandleDragEnd, defaultOpen, onDeleted,
}: {
  table: TableModel;
  column: Column;
  /** The column's neighbours (same container) for the up/down arrows. */
  siblings: { id: string }[];
  groupId: string;
  onHandleDragStart?: (e: React.DragEvent) => void;
  onHandleDragEnd?: () => void;
  defaultOpen?: boolean;
  onDeleted?: () => void;
}) {
  const data = useEditor((s) => s.data);
  const st = useEditor.getState();
  const fkOptions: FkOption[] = data.tables.map((t) => ({
    tableId: t.id,
    tableName: t.name,
    columns: [...allColumns(t)].sort((a, b) => Number(b.primaryKey) - Number(a.primaryKey)).map((c) => ({ id: c.id, name: c.name, pk: c.primaryKey, unique: isUniqueColumn(t, c) })),
  }));
  const groupOptions = table.items.filter((i) => i.kind === "group").map((g) => ({ id: g.id, name: g.name }));
  const idx = siblings.findIndex((s) => s.id === column.id);
  const rel = relationshipFor(data, table.id, column.id);

  return (
    <ColumnEditor
      column={column}
      isFk={!!rel}
      fkValue={rel ? `${rel.toTableId}:${rel.toColumnId}` : ""}
      fkOptions={fkOptions}
      groupId={groupId}
      groupOptions={groupOptions}
      canMoveUp={idx > 0}
      canMoveDown={idx < siblings.length - 1}
      onChange={(patch) => st.updateColumn(table.id, column.id, patch)}
      onDelete={() => { st.deleteColumn(table.id, column.id); onDeleted?.(); }}
      onMove={(dir) => st.moveColumn(table.id, column.id, dir)}
      onFkChange={(v) => {
        const [tableId, columnId] = v.split(":");
        st.setForeignKey(table.id, column.id, v ? { tableId, columnId } : null);
      }}
      onGroupChange={(g) => st.moveColumnToGroup(table.id, column.id, g || null)}
      onHandleDragStart={onHandleDragStart}
      onHandleDragEnd={onHandleDragEnd}
      defaultOpen={defaultOpen}
    />
  );
}
