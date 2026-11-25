import type { DesignMeta } from "@/domain/types";
import { TextArea } from "../atoms/TextArea";
import { TextInput } from "../atoms/TextInput";
import { Field } from "./Field";

export function DesignMetaForm({ value, onChange }: { value: DesignMeta; onChange: (v: DesignMeta) => void }) {
  const set = (p: Partial<DesignMeta>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3">
      <Field label="Name">
        <TextInput value={value.name} autoFocus onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Shop schema" />
      </Field>
      <Field label="Short description">
        <TextInput value={value.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} placeholder="One line summary" />
      </Field>
      <Field label="Long description">
        <TextArea rows={5} value={value.longDescription} onChange={(e) => set({ longDescription: e.target.value })} placeholder="Purpose, conventions, notes..." />
      </Field>
    </div>
  );
}
