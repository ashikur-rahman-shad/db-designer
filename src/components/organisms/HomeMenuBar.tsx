"use client";
import type { ViewOptions } from "@/domain/viewOptions";
import { MenuDropdown } from "../molecules/MenuDropdown";
import { ViewModeToggle } from "../molecules/ViewModeToggle";

/** Top menu of the home page: only the parts that apply without an open design. */
export function HomeMenuBar({
  viewOptions, onChange, onNew, onImport, onSettings,
}: {
  viewOptions: ViewOptions;
  onChange: (patch: Partial<ViewOptions>) => void;
  onNew: () => void;
  onImport: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="flex h-11 items-center gap-2 border-b border-slate-200 bg-white px-3">
      <span className="mr-2 text-sm font-bold">DB Designer</span>
      <MenuDropdown
        label="File"
        entries={[
          { label: "New design…", onClick: onNew },
          { label: "Import SQL / JSON…", onClick: onImport },
        ]}
      />
      <MenuDropdown
        label="View"
        entries={[
          { label: "Full view (all columns)", checked: viewOptions.viewMode === "full", onClick: () => onChange({ viewMode: "full" }) },
          { label: "Logical view (logical columns only)", checked: viewOptions.viewMode === "logical", onClick: () => onChange({ viewMode: "logical" }) },
          { type: "separator" },
          { label: "Hide groups (show columns without groups)", checked: viewOptions.hideGroups, onClick: () => onChange({ hideGroups: !viewOptions.hideGroups }) },
          { label: "Show grid", checked: viewOptions.showGrid, onClick: () => onChange({ showGrid: !viewOptions.showGrid }) },
          { label: "Show column attributes", checked: viewOptions.showAttributes, onClick: () => onChange({ showAttributes: !viewOptions.showAttributes }) },
          { label: "Show descriptions", checked: viewOptions.showDescriptions, onClick: () => onChange({ showDescriptions: !viewOptions.showDescriptions }) },
          { label: "Show line annotations", checked: viewOptions.showLabels, onClick: () => onChange({ showLabels: !viewOptions.showLabels }) },
          { label: "Show cardinality markers", checked: viewOptions.showMarkers, onClick: () => onChange({ showMarkers: !viewOptions.showMarkers }) },
        ]}
      />
      <MenuDropdown label="Settings" entries={[{ label: "Settings…", onClick: onSettings }]} />
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <ViewModeToggle viewMode={viewOptions.viewMode} onChange={(viewMode) => onChange({ viewMode })} />
    </header>
  );
}
