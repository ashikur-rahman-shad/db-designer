"use client";
import type { ViewOptions } from "@/domain/viewOptions";
import { Checkbox } from "../atoms/Checkbox";
import { Field } from "./Field";
import { SelectInput } from "../atoms/SelectInput";

/** The remembered (global) view options as a form. Used by the home page Settings dialog. */
export function ViewOptionsFields({ value, onChange }: { value: ViewOptions; onChange: (patch: Partial<ViewOptions>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Diagram view">
        <SelectInput value={value.viewMode} onChange={(e) => onChange({ viewMode: e.target.value as ViewOptions["viewMode"] })} aria-label="Diagram view">
          <option value="full">Full view (all columns)</option>
          <option value="logical">Logical view (logical columns only)</option>
        </SelectInput>
      </Field>
      <div className="space-y-2">
        <Checkbox label="Hide groups (show columns without groups)" checked={value.hideGroups} onChange={(e) => onChange({ hideGroups: e.target.checked })} />
        <Checkbox label="Show grid" checked={value.showGrid} onChange={(e) => onChange({ showGrid: e.target.checked })} />
        <Checkbox label="Show column attributes (not null, unique, enum…)" checked={value.showAttributes} onChange={(e) => onChange({ showAttributes: e.target.checked })} />
        <Checkbox label="Show descriptions" checked={value.showDescriptions} onChange={(e) => onChange({ showDescriptions: e.target.checked })} />
        <Checkbox label="Show line annotations" checked={value.showLabels} onChange={(e) => onChange({ showLabels: e.target.checked })} />
        <Checkbox label="Show cardinality markers (crow’s foot)" checked={value.showMarkers} onChange={(e) => onChange({ showMarkers: e.target.checked })} />
        <Checkbox label="Open the Properties panel in the designer" checked={value.panelOpen} onChange={(e) => onChange({ panelOpen: e.target.checked })} />
      </div>
    </div>
  );
}
