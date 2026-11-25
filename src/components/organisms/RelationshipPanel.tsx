"use client";
import { findColumn } from "@/domain/model";
import { REF_ACTIONS, type LabelDirection, type RefAction, type Relationship } from "@/domain/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { SelectInput } from "../atoms/SelectInput";
import { TextInput } from "../atoms/TextInput";
import { Field } from "../molecules/Field";

export function RelationshipPanel({ rel }: { rel: Relationship }) {
  const data = useEditor((s) => s.data);
  const st = useEditor.getState();
  const from = data.tables.find((t) => t.id === rel.fromTableId);
  const to = data.tables.find((t) => t.id === rel.toTableId);
  const effective = rel.labelDirection ?? data.settings.labelDirection;
  const label = (t: typeof from, colId: string) => `${t?.name ?? "?"}.${findColumn(t, colId)?.name ?? "?"}`;

  return (
    <div className="space-y-3">
      <p className="mono rounded bg-slate-100 p-2 text-xs">
        {label(from, rel.fromColumnId)} <span className="text-slate-400">→</span> {label(to, rel.toColumnId)}
      </p>
      <Field label="Annotation (shown on the line)">
        <TextInput value={rel.label} onChange={(e) => st.updateRelationship(rel.id, { label: e.target.value })} placeholder="e.g. places" />
      </Field>
      <Field label="Label position">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-slate-600">
            {rel.labelPos == null ? "Automatic (middle of the line)" : `Manual — ${Math.round(rel.labelPos.distance)} px from the ${rel.labelPos.from === "start" ? "foreign key (child)" : "referenced (parent)"} end`}
          </span>
          <Button size="sm" disabled={rel.labelPos == null} onClick={() => st.updateRelationship(rel.id, { labelPos: null })}>Reset</Button>
        </div>
        <p className="mt-1 text-xs text-slate-400">Drag the label along the line. Its centre always stays on the line.</p>
      </Field>
      <Field label="Label reads">
        <div className="flex gap-2">
          <SelectInput
            value={rel.labelDirection ?? ""}
            onChange={(e) => st.updateRelationship(rel.id, { labelDirection: (e.target.value || undefined) as LabelDirection | undefined })}
          >
            <option value="">Design default ({data.settings.labelDirection === "child-to-parent" ? "child to parent" : "parent to child"})</option>
            <option value="parent-to-child">{to?.name ?? "parent"} → {from?.name ?? "child"} (parent to child)</option>
            <option value="child-to-parent">{from?.name ?? "child"} → {to?.name ?? "parent"} (child to parent)</option>
          </SelectInput>
          <Button title="Flip the reading direction of this label" onClick={() => st.updateRelationship(rel.id, { labelDirection: effective === "child-to-parent" ? "parent-to-child" : "child-to-parent" })}>⇄ Flip</Button>
        </div>
        <p className="mt-1 text-xs text-slate-400">The pointed end of the label box faces the table the label reads towards. The design default is in Settings.</p>
      </Field>
      <Field label="On delete">
        <SelectInput value={rel.onDelete} onChange={(e) => st.updateRelationship(rel.id, { onDelete: e.target.value as RefAction })}>
          {REF_ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </SelectInput>
      </Field>
      <Field label="On update">
        <SelectInput value={rel.onUpdate} onChange={(e) => st.updateRelationship(rel.id, { onUpdate: e.target.value as RefAction })}>
          {REF_ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </SelectInput>
      </Field>
      <Field label="Bend (grid cells)">
        <div className="flex gap-2">
          <TextInput type="number" value={rel.bend} onChange={(e) => st.updateRelationship(rel.id, { bend: Math.round(Number(e.target.value) || 0) })} />
          <Button onClick={() => st.updateRelationship(rel.id, { bend: 0 })}>Reset</Button>
        </div>
        <p className="mt-1 text-xs text-slate-400">Tip: drag the blue dot on the selected line to move its middle run.</p>
      </Field>
      <Button variant="danger" className="w-full" onClick={() => st.deleteRelationship(rel.id)}>Delete relationship</Button>
    </div>
  );
}
