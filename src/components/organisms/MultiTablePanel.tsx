"use client";
import { useState } from "react";
import type { TableModel } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { SelectInput } from "../atoms/SelectInput";
import { TextArea } from "../atoms/TextArea";
import { TextInput } from "../atoms/TextInput";
import { ColorPicker } from "../molecules/ColorPicker";
import { Field } from "../molecules/Field";

const NEW = "__new__";
const MIXED = "__mixed__";

/** Properties shared by all selected tables (color, table group); changes apply to every selected table. */
export function MultiTablePanel({ tables }: { tables: TableModel[] }) {
  const groups = useEditor((s) => s.data.tableGroups);
  const st = useEditor.getState();
  const ids = tables.map((t) => t.id);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const sameColor = tables.every((t) => t.color.toLowerCase() === tables[0].color.toLowerCase());
  const sameGroup = tables.every((t) => t.groupId === tables[0].groupId);
  const trimmed = name.trim();
  const clash = !!trimmed && groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase());

  const create = () => {
    if (!trimmed || clash) return;
    st.setTablesGroup(ids, st.addTableGroup(trimmed, description));
    setCreating(false); setName(""); setDescription("");
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{tables.length} tables selected</p>
        <p className="mono mt-1 max-h-24 overflow-y-auto text-xs leading-5 text-slate-600">{tables.map((t) => t.name).join(", ")}</p>
        <p className="mt-1 text-xs text-slate-400">Only properties common to all selected tables are shown. Drag any selected table to move them together.</p>
      </div>

      <Field label={sameColor ? "Color" : "Color (mixed)"}>
        <ColorPicker value={sameColor ? tables[0].color : ""} onChange={(color) => st.updateTables(ids, { color })} />
      </Field>

      <div className="space-y-2">
        <Field label={sameGroup ? "Table group" : "Table group (mixed)"}>
          <SelectInput
            aria-label="Table group"
            value={creating ? NEW : sameGroup ? tables[0].groupId ?? "" : MIXED}
            onChange={(e) => {
              const v = e.target.value;
              if (v === NEW) { setCreating(true); return; }
              if (v === MIXED) return;
              setCreating(false);
              st.setTablesGroup(ids, v || null);
            }}
          >
            {!sameGroup && !creating && <option value={MIXED} disabled>— mixed —</option>}
            <option value="">— none —</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value={NEW}>+ New group…</option>
          </SelectInput>
        </Field>
        {creating && (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-2">
            <Field label="New group name"><TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales" /></Field>
            {clash && <p className="text-xs text-red-600">A group with this name already exists — pick it from the list.</p>}
            <Field label="Group description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" disabled={!trimmed || clash} onClick={create}>Create group</Button>
              <Button size="sm" onClick={() => { setCreating(false); setName(""); setDescription(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <Button variant="danger" className="w-full" onClick={() => confirm(`Delete ${tables.length} tables and their relationships?`) && st.deleteTables(ids)}>
        Delete {tables.length} tables
      </Button>
      <Button size="sm" onClick={() => st.select(null)}>Clear selection</Button>
    </div>
  );
}
