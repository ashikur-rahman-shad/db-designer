"use client";
import type { ViewMode } from "@/domain/types";

/** One button in the top bar that switches between full and logical view; its label shows the active view. */
export function ViewModeToggle({ viewMode, onChange }: { viewMode: ViewMode; onChange: (m: ViewMode) => void }) {
  const logical = viewMode === "logical";
  return (
    <button
      type="button"
      onClick={() => onChange(logical ? "full" : "logical")}
      title={`${logical ? "Logical" : "Full"} view is active — click to switch to ${logical ? "full" : "logical"} view`}
      aria-label={`${logical ? "Logical" : "Full"} view (click to switch)`}
      className={`rounded border px-2.5 py-1 text-sm font-medium ${
        logical ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {logical ? "Logical view" : "Full view"}
    </button>
  );
}
