"use client";
import { allColumns, indexName } from "@/domain/model";
import type { TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { Checkbox } from "../atoms/Checkbox";
import { Chip } from "../atoms/Chip";
import { IconButton } from "../atoms/IconButton";
import { TextInput } from "../atoms/TextInput";

/** Secondary / unique indexes of a table (the primary key is set with each column's PK flag). */
export function Indexes({ table, onlyColumnIds, canAdd = true, newIndexColumnIds }: {
  table: TableModel;
  /** Show only the indexes that mention at least one of these columns (column / group views). */
  onlyColumnIds?: string[];
  canAdd?: boolean;
  /** Columns a new index starts with (so it stays visible in a filtered view). */
  newIndexColumnIds?: string[];
}) {
  const st = useEditor.getState();
  const cols = allColumns(table);
  const filter = onlyColumnIds ? new Set(onlyColumnIds) : null;
  const shown = filter ? table.indexes.filter((ix) => ix.columnIds.some((id) => filter.has(id))) : table.indexes;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Indexes</h3>
        {canAdd && (
          <Button size="sm" className="ml-auto" disabled={cols.length === 0} onClick={() => st.addIndex(table.id, { columnIds: newIndexColumnIds ?? (cols.length > 1 ? [] : [cols[0].id]) })}>+ Index</Button>
        )}
      </div>
      {shown.length === 0 && (
        <p className="text-sm italic text-slate-400">
          {filter ? "No index mentions this column." : "No indexes. A unique index makes the combination of its columns unique."}
        </p>
      )}
      {shown.map((ix) => {
        const toggle = (id: string) =>
          st.updateIndex(table.id, ix.id, { columnIds: ix.columnIds.includes(id) ? ix.columnIds.filter((x) => x !== id) : [...ix.columnIds, id] });
        return (
          <div key={ix.id} className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-1.5">
            <div className="flex items-center gap-1">
              <TextInput
                value={ix.name} onChange={(e) => st.updateIndex(table.id, ix.id, { name: e.target.value })}
                placeholder={indexName(table, ix)} aria-label="Index name" className="mono"
              />
              <Checkbox label="Unique" checked={ix.unique} onChange={(e) => st.updateIndex(table.id, ix.id, { unique: e.target.checked })} />
              <IconButton onClick={() => st.deleteIndex(table.id, ix.id)} aria-label="Delete index" className="hover:!bg-red-100 hover:!text-red-600">✕</IconButton>
            </div>
            <div className="flex flex-wrap gap-1">
              {cols.map((c) => {
                const pos = ix.columnIds.indexOf(c.id);
                return (
                  <Chip key={c.id} on={pos >= 0} onClick={() => toggle(c.id)} className="mono !text-xs" title="Click to add / remove; the order of selection is the key order">
                    {pos >= 0 ? `${pos + 1}. ` : ""}{c.name}
                  </Chip>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              {ix.columnIds.length === 0 ? "Pick at least one column."
                : ix.unique ? `${ix.columnIds.length > 1 ? "The combination of " : ""}(${columnNames(table, ix.columnIds)}) must be unique.` : `Index on (${columnNames(table, ix.columnIds)}).`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

const columnNames = (t: TableModel, ids: string[]) => {
  const byId = new Map(allColumns(t).map((c) => [c.id, c.name]));
  return ids.map((id) => byId.get(id) ?? "?").join(", ");
};
