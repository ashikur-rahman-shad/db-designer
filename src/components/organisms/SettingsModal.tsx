"use client";
import { useState } from "react";
import { LOGICAL_PROPS, type LabelDirection } from "@/domain/types";
import { MAX_UNDO_LIMIT } from "@/domain/viewOptions";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { Checkbox } from "../atoms/Checkbox";
import { SelectInput } from "../atoms/SelectInput";
import { TextInput } from "../atoms/TextInput";
import { Field } from "../molecules/Field";
import { Modal } from "../molecules/Modal";
import { ColorPicker } from "../molecules/ColorPicker";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useEditor((st) => st.data.settings);
  const update = useEditor.getState().updateSettings;
  const undoLimit = useEditor((st) => st.undoLimit);
  // Edited as text and applied on blur / Enter: lowering the limit drops old steps, so it must not happen mid-typing.
  const [undoDraft, setUndoDraft] = useState<string | null>(null);
  const commitUndo = () => {
    if (undoDraft !== null && undoDraft.trim() !== "") useEditor.getState().setUndoLimit(Number(undoDraft));
    setUndoDraft(null);
  };
  return (
    <Modal title="Diagram settings" onClose={onClose} footer={<Button variant="primary" onClick={() => { commitUndo(); onClose(); }}>Done</Button>}>
      <div className="space-y-4">
        <Field label={`Line corner radius: ${s.cornerRadius}px`}>
          <input type="range" min={0} max={30} step={1} value={s.cornerRadius} onChange={(e) => update({ cornerRadius: Number(e.target.value) })} className="w-full accent-blue-600" />
        </Field>
        <Field label={`Line width: ${s.lineWidth}px`}>
          <input type="range" min={1} max={5} step={0.5} value={s.lineWidth} onChange={(e) => update({ lineWidth: Number(e.target.value) })} className="w-full accent-blue-600" />
        </Field>
        <Field label={`Line stub length: ${s.stubLength}px (distance before the first bend)`}>
          <input type="range" min={10} max={60} step={10} value={s.stubLength} onChange={(e) => update({ stubLength: Number(e.target.value) })} className="w-full accent-blue-600" />
        </Field>
        <Field label="Line color">
          <input type="color" value={s.lineColor} onChange={(e) => update({ lineColor: e.target.value })} className="h-8 w-14 cursor-pointer rounded border border-slate-300" />
        </Field>
        <Field label="Default color for new tables">
          <ColorPicker value={s.defaultTableColor} onChange={(c) => update({ defaultTableColor: c })} />
        </Field>
        <Field label="Undo history (steps)">
          <div className="flex items-center gap-2">
            <TextInput
              type="number" min={0} max={MAX_UNDO_LIMIT} step={1} value={undoDraft ?? undoLimit} aria-label="Number of undo steps"
              onChange={(e) => setUndoDraft(e.target.value)} onBlur={commitUndo} onKeyDown={(e) => e.key === "Enter" && commitUndo()}
              className="!w-24"
            />
            <span className="text-xs text-slate-500">0 turns undo / redo off. Applies to all diagrams (max {MAX_UNDO_LIMIT}).</span>
          </div>
        </Field>
        <Field label="Relationship labels read">
          <SelectInput value={s.labelDirection} onChange={(e) => update({ labelDirection: e.target.value as LabelDirection })}>
            <option value="parent-to-child">Parent to child:  parent |label&gt; child</option>
            <option value="child-to-parent">Child to parent:  parent &lt;label| child</option>
          </SelectInput>
          <p className="mt-1 text-xs text-slate-500">Which way the pointed end of each label faces. Individual relationships can override it.</p>
        </Field>
        <div className="space-y-2">
          <Checkbox label="Hide groups (show columns without groups)" checked={s.hideGroups} onChange={(e) => update({ hideGroups: e.target.checked })} />
          <Checkbox label="Show grid" checked={s.showGrid} onChange={(e) => update({ showGrid: e.target.checked })} />
          <Checkbox label="Show cardinality markers (crow’s foot)" checked={s.showMarkers} onChange={(e) => update({ showMarkers: e.target.checked })} />
          <Checkbox label="Show column attributes (not null, unique, enum…)" checked={s.showAttributes} onChange={(e) => update({ showAttributes: e.target.checked })} />
          <Checkbox label="Show descriptions" checked={s.showDescriptions} onChange={(e) => update({ showDescriptions: e.target.checked })} />
          <Checkbox label="Show line annotations" checked={s.showLabels} onChange={(e) => update({ showLabels: e.target.checked })} />
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-semibold">Mandatory logical column properties</h3>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            In the logical view, columns with any of these properties always appear, even if the column&apos;s own
            “Logical” flag is off.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {LOGICAL_PROPS.map((p) => (
              <Checkbox
                key={p.key}
                label={<span title={p.title}>{p.label}</span>}
                checked={s.logicalMandatory.includes(p.key)}
                onChange={(e) =>
                  update({ logicalMandatory: e.target.checked ? [...s.logicalMandatory, p.key] : s.logicalMandatory.filter((k) => k !== p.key) })
                }
              />
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400">Tables and lines always snap to a 10px grid; lines are always orthogonal.</p>
      </div>
    </Modal>
  );
}
