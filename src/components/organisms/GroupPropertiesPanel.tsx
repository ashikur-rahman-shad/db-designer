"use client";
import type { ColumnGroup, TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { Checkbox } from "../atoms/Checkbox";
import { TextArea } from "../atoms/TextArea";
import { TextInput } from "../atoms/TextInput";
import { Field } from "../molecules/Field";
import { ConnectedColumnEditor } from "./ConnectedColumnEditor";
import { Indexes } from "./Indexes";

/** Properties of one column group only (shown when a group row is clicked on the canvas). */
export function GroupPropertiesPanel({ table, group }: { table: TableModel; group: ColumnGroup }) {
  const st = useEditor.getState();
  const idx = table.items.findIndex((i) => i.id === group.id);
  const selectTable = () => st.select({ type: "table", id: table.id });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Column group in</span>
        <button type="button" onClick={selectTable} className="mono font-semibold text-blue-600 hover:underline" title="Show all properties of the table">
          {table.name}
        </button>
      </div>
      <Field label="Group name">
        <TextInput value={group.name} onChange={(e) => st.updateGroup(table.id, group.id, { name: e.target.value })} className="font-semibold" />
      </Field>
      <Field label="Group description">
        <TextArea value={group.description} onChange={(e) => st.updateGroup(table.id, group.id, { description: e.target.value })} placeholder="What do these columns have in common?" />
      </Field>
      <Checkbox
        label="Collapsed on the diagram (view only, not saved)"
        checked={group.collapsed}
        onChange={(e) => st.updateGroup(table.id, group.id, { collapsed: e.target.checked })}
      />
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Columns in this group ({group.columns.length})</h3>
        <Button size="sm" className="ml-auto" onClick={() => st.addColumn(table.id, group.id)}>+ Column</Button>
      </div>
      <div className="space-y-2">
        {group.columns.map((c) => (
          <ConnectedColumnEditor key={c.id} table={table} column={c} siblings={group.columns} groupId={group.id} />
        ))}
        {group.columns.length === 0 && <p className="text-sm italic text-slate-400">No columns in this group yet.</p>}
      </div>
      <Indexes table={table} onlyColumnIds={group.columns.map((c) => c.id)} canAdd={false} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={idx <= 0} onClick={() => st.moveItem(table.id, group.id, -1)}>Move up</Button>
        <Button size="sm" disabled={idx >= table.items.length - 1} onClick={() => st.moveItem(table.id, group.id, 1)}>Move down</Button>
      </div>
      <Button
        variant="danger" className="w-full"
        onClick={() => { if (confirm(`Delete group “${group.name}”? Its columns are kept.`)) { st.deleteGroup(table.id, group.id); selectTable(); } }}
      >
        Delete group (keeps columns)
      </Button>
      <Button size="sm" onClick={selectTable}>All table properties</Button>
    </div>
  );
}
