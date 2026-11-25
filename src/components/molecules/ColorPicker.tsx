import { TABLE_COLORS } from "@/domain/factory";

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TABLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={`h-5 w-5 rounded-full border-2 ${value.toLowerCase() === c ? "border-slate-900" : "border-white shadow ring-1 ring-slate-300"}`}
        />
      ))}
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#3b82f6"}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0"
        aria-label="Custom color"
      />
    </div>
  );
}
