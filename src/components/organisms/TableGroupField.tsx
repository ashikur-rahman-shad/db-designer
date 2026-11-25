"use client";
import { useState } from "react";
import type { TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { SelectInput } from "../atoms/SelectInput";
import { TextArea } from "../atoms/TextArea";
import { TextInput } from "../atoms/TextInput";
import { Field } from "../molecules/Field";

const NEW = "__new__";

/**
 * Picks the table group of a table, creates new groups, and edits / deletes the selected one.
 * (A table group is a named set of tables; not to be confused with column groups inside a table.)
 */
export function TableGroupField({ table }: { table: TableModel }) {
  const groups = useEditor((s) => s.data.tableGroups);
  const tables = useEditor((s) => s.data.tables);
  const st = useEditor.getState();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const current = groups.find((g) => g.id === table.groupId);
  const trimmed = name.trim();
  const clash = !!trimmed && groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase());
  const renameClash = !!current && groups.some((g) => g.id !== current.id && g.name.trim().toLowerCase() === current.name.trim().toLowerCase());

  const create = () => {
    if (!trimmed || clash) return;
    const id = st.addTableGroup(trimmed, description);
    st.setTableGroup(table.id, id);
    setCreating(false);
    setName("");
    setDescription("");
  };

  return (
    <div className="space-y-2">
      <Field label="Table group">
        <SelectInput
          aria-label="Table group"
          value={creating ? NEW : table.groupId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === NEW) { setCreating(true); return; }
            setCreating(false);
            st.setTableGroup(table.id, v || null);
          }}
        >
          <option value="">— none —</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          <option value={NEW}>+ New group…</option>
        </SelectInput>
      </Field>

      {creating && (
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-2">
          <Field label="New group name">
            <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales" />
          </Field>
          {clash && <p className="text-xs text-red-600">A group with this name already exists — pick it from the list.</p>}
          <Field label="Group description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do the tables in this group have in common?" />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={!trimmed || clash} onClick={create}>Create group</Button>
            <Button size="sm" onClick={() => { setCreating(false); setName(""); setDescription(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      {current && !creating && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <Field label="Group name">
            <TextInput value={current.name} onChange={(e) => st.updateTableGroup(current.id, { name: e.target.value })} />
          </Field>
          {renameClash && <p className="text-xs text-red-600">Another group has the same name; they would merge when imported from SQL.</p>}
          <Field label="Group description">
            <TextArea value={current.description} onChange={(e) => st.updateTableGroup(current.id, { description: e.target.value })} />
          </Field>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Shared by {tables.filter((t) => t.groupId === current.id).length} table(s)
            <Button
              variant="danger" size="sm" className="ml-auto"
              onClick={() => confirm(`Delete group “${current.name}”? Its tables stay, but become ungrouped.`) && st.deleteTableGroup(current.id)}
            >
              Delete group
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
