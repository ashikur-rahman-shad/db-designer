"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { downloadText, safeFileName } from "@/lib/download";
import { restoreVersion } from "@/lib/designApi";
import { buildDrawioXml } from "@/lib/drawio";
import { buildSvg } from "@/lib/exportSvg";
import { exportJson } from "@/lib/json";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { MenuDropdown } from "../molecules/MenuDropdown";
import { DesignInfoModal } from "./DesignInfoModal";
import { DataDictionaryModal } from "./DataDictionaryModal";
import { ExportSqlModal } from "./ExportSqlModal";
import { ImportModal } from "./ImportModal";
import { SaveVersionModal } from "./SaveVersionModal";
import { SettingsModal } from "./SettingsModal";
import { VersionHistoryModal } from "./VersionHistoryModal";

type Dialog = "info" | "import" | "sql" | "settings" | "save-version" | "history" | "dictionary" | null;

const STATUS = { saved: "Saved", dirty: "Unsaved changes…", saving: "Saving…", error: "Save failed — retrying" };

async function copyProtocol(name: "json" | "sql") {
  try {
    const res = await fetch(`/api/protocol/${name}`);
    if (!res.ok) throw new Error(String(res.status));
    await navigator.clipboard.writeText(await res.text());
  } catch {
    alert("Could not copy the protocol to the clipboard.");
  }
}

function exportSvg() {
  const s = useEditor.getState();
  const svg = buildSvg(s.data);
  if (!svg) return alert("Nothing to export: the design has no tables.");
  downloadText(`${safeFileName(s.meta.name)}.svg`, svg, "image/svg+xml");
}

function exportDrawio() {
  const s = useEditor.getState();
  if (!s.data.tables.length) return alert("Nothing to export: the design has no tables.");
  downloadText(`${safeFileName(s.meta.name)}.drawio`, buildDrawioXml(s.meta, s.data), "application/vnd.jgraph.mxfile");
}

async function copyDesignJson() {
  try {
    const s = useEditor.getState();
    await navigator.clipboard.writeText(exportJson(s.meta, s.data));
  } catch {
    alert("Could not copy the JSON to the clipboard.");
  }
}

export function MenuBar() {
  const meta = useEditor((s) => s.meta);
  const settings = useEditor((s) => s.data.settings);
  const saveStatus = useEditor((s) => s.saveStatus);
  const tableCount = useEditor((s) => s.data.tables.length);
  const panelOpen = useEditor((s) => s.panelOpen);
  const versionInfo = useEditor((s) => s.versionInfo);
  const viewing = useEditor((s) => s.viewing);
  const search = useEditor((s) => s.search);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const undoLimit = useEditor((s) => s.undoLimit);
  const canUndo = !viewing && undoLimit > 0 && past > 0;
  const canRedo = !viewing && undoLimit > 0 && future > 0;
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const st = useEditor.getState();
  const close = () => setDialog(null);

  // Ctrl/Cmd+S = the "Save version" button (and stops the browser's own "save page" dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      const { viewing: v, versionInfo: vi } = useEditor.getState();
      if (v || !vi.changedSinceVersion) return; // an old version is read-only; nothing to save when unchanged
      setDialog((d) => (d === null ? "save-version" : d));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const modified = !viewing && versionInfo.latest > 0 && versionInfo.changedSinceVersion;
  const undoIcon = (flip: boolean) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
  const iconBtn = "hidden rounded p-1 sm:block text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-30";

  return (
    <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1 gap-y-1 whitespace-nowrap border-b border-slate-200 bg-white px-2 py-1">
      {/* Wide (xl+): one row; the two side groups share the free space equally (search centred) but never get narrower
          than their content, so the search moves off-centre when one side is crowded.
          Narrower: left and right groups stay together on the first row and the search drops to a centred second row. */}
      <div className="order-1 flex min-w-0 flex-1 items-center gap-1 xl:min-w-max xl:basis-0">
      <Link href="/" className="shrink-0 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" title="Back to all designs" aria-label="Back to all designs">←</Link>
      <button type="button" onClick={() => !viewing && setDialog("info")} className="min-w-0 max-w-64 shrink truncate rounded px-1.5 py-1 text-sm font-semibold hover:bg-slate-100" title="Edit design info">
        {meta.name || "Untitled"}
      </button>
      <MenuDropdown
        label="File"
        entries={[
          { label: "Design info…", disabled: !!viewing, onClick: () => setDialog("info") },
          { type: "separator" },
          { label: "Save version…", disabled: !!viewing, onClick: () => setDialog("save-version") },
          { label: "Version history…", onClick: () => setDialog("history") },
          { type: "separator" },
          { label: "Import…", disabled: !!viewing, onClick: () => setDialog("import") },
          {
            type: "submenu",
            label: "Export",
            items: [
              { label: "SQL…", onClick: () => setDialog("sql") },
              {
                type: "submenu",
                label: "JSON",
                items: [
                  { label: "Download", onClick: () => { const s = useEditor.getState(); downloadText(`${safeFileName(s.meta.name)}.json`, exportJson(s.meta, s.data), "application/json"); } },
                  { label: "Copy", onClick: copyDesignJson },
                ],
              },
              { label: "SVG", onClick: exportSvg },
              { label: "Draw.io", onClick: exportDrawio },
            ],
          },
          {
            type: "submenu",
            label: "Copy protocol",
            items: [
              { label: "JSON", onClick: () => copyProtocol("json") },
              { label: "SQL", onClick: () => copyProtocol("sql") },
            ],
          },
          { type: "separator" },
          { label: "Data dictionary…", onClick: () => setDialog("dictionary") },
          { label: "Diagram settings…", onClick: () => setDialog("settings") },
        ]}
      />
      <MenuDropdown
        label="Edit"
        entries={[
          { label: `Undo${canUndo ? ` (${past} step${past === 1 ? "" : "s"})` : ""}`, disabled: !canUndo, onClick: () => st.undo() },
          { label: `Redo${canRedo ? ` (${future} step${future === 1 ? "" : "s"})` : ""}`, disabled: !canRedo, onClick: () => st.redo() },
        ]}
      />
      <MenuDropdown
        label="View"
        entries={[
          { label: "Full view (all columns)", checked: settings.viewMode === "full", onClick: () => st.updateSettings({ viewMode: "full" }) },
          { label: "Logical view (logical columns only)", checked: settings.viewMode === "logical", onClick: () => st.updateSettings({ viewMode: "logical" }) },
          { type: "separator" },
          { label: "Collapse all groups", onClick: () => st.setAllColumnGroupsCollapsed(true) },
          { label: "Unfold all groups", onClick: () => st.setAllColumnGroupsCollapsed(false) },
          { type: "separator" },
          { label: "Hide groups (always on in logical view)", checked: settings.hideGroups || settings.viewMode === "logical", disabled: settings.viewMode === "logical", onClick: () => st.updateSettings({ hideGroups: !settings.hideGroups }) },
          { label: "Show grid", checked: settings.showGrid, onClick: () => st.updateSettings({ showGrid: !settings.showGrid }) },
          { label: "Show column attributes (not null, unique, enum…)", checked: settings.showAttributes, onClick: () => st.updateSettings({ showAttributes: !settings.showAttributes }) },
          { label: "Show descriptions", checked: settings.showDescriptions, onClick: () => st.updateSettings({ showDescriptions: !settings.showDescriptions }) },
          { label: "Show line annotations", checked: settings.showLabels, onClick: () => st.updateSettings({ showLabels: !settings.showLabels }) },
          { label: "Show cardinality markers", checked: settings.showMarkers, onClick: () => st.updateSettings({ showMarkers: !settings.showMarkers }) },
        ]}
      />
      <span className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block" />
      <button type="button" onClick={() => st.undo()} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/⌘+Z)" className={iconBtn}>{undoIcon(false)}</button>
      <button type="button" onClick={() => st.redo()} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)" className={iconBtn}>{undoIcon(true)}</button>
      </div>
      <div className="order-3 flex w-full justify-center xl:order-2 xl:w-auto">
      <div className="relative w-72 max-w-full shrink-0">
        <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          type="text"
          value={search}
          onChange={(e) => st.setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && search) { e.stopPropagation(); st.setSearch(""); } }}
          placeholder="Search tables, columns, lines…"
          aria-label="Search tables, columns and line labels (name, description, enum values, default)"
          title="Search tables, columns and line labels (name, description, enum values, default)"
          className="h-7 w-full rounded-md border border-slate-300 bg-slate-50 pl-8 pr-7 text-sm outline-none focus:border-blue-500 focus:bg-white"
        />
        {search && (
          <button type="button" onClick={() => st.setSearch("")} aria-label="Clear search" title="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-sm leading-none text-slate-400 hover:text-slate-700">✕</button>
        )}
      </div>
      </div>
      <div className="order-2 flex shrink-0 items-center justify-end gap-1 xl:order-3 xl:min-w-max xl:flex-1 xl:basis-0">
      <span className="shrink-0 whitespace-nowrap px-1 text-xs text-slate-500" title="Number of tables in this design">
        {tableCount} {tableCount === 1 ? "table" : "tables"}
      </span>
      <span
        className={`inline-flex shrink-0 p-1 ${saveStatus === "error" ? "text-red-600" : saveStatus === "saved" ? "text-emerald-600" : "text-slate-400"} ${saveStatus === "saving" ? "animate-pulse" : ""}`}
        title={STATUS[saveStatus]}
        role="status"
        aria-label={STATUS[saveStatus]}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.9 8.5 4.75 4.75 0 0 1 17.5 18Z" />
          {saveStatus === "saved" && <path d="m9 13 2.2 2.2L15.5 11" />}
          {(saveStatus === "dirty" || saveStatus === "saving") && <path d="M12 16v-5m0 0-2 2m2-2 2 2" />}
          {saveStatus === "error" && <path d="M12 10.5v3m0 2.2v.01" />}
        </svg>
      </span>
      <button
        type="button"
        onClick={() => setDialog("history")}
        title="Version history"
        className={`rounded px-2 py-1 text-xs ${viewing ? "bg-amber-100 font-semibold text-amber-800 hover:bg-amber-200" : "text-slate-600 hover:bg-slate-100"}`}
      >
        {viewing ? `v${viewing.version} · viewing` : versionInfo.latest ? `v${versionInfo.latest}` : "No versions"}
        {modified && <span className="ml-1 text-amber-600" title="Changes since this version" aria-label="Modified">●</span>}
      </button>
      {viewing ? (
        <>
          <Button variant="primary" size="sm" onClick={() => router.push(`/designs/${useEditor.getState().id}`)} title="Back to the latest, editable design">
            Jump to latest{versionInfo.latest ? ` (v${versionInfo.latest})` : ""}
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              if (!confirm(`Restore version ${viewing.version} as the current design? Version history is kept.${versionInfo.changedSinceVersion ? "\n\nThe current design has changes that are not in a saved version; they will be replaced." : ""}`)) return;
              await restoreVersion(viewing.version);
              router.push(`/designs/${useEditor.getState().id}`);
            }}
          >
            Restore this version
          </Button>
        </>
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled={!versionInfo.changedSinceVersion}
          onClick={() => setDialog("save-version")}
          aria-label="Save version"
          title={versionInfo.changedSinceVersion ? "Save a new version (Ctrl/⌘+S)" : "No changes since the last saved version"}
          className="disabled:!border-transparent disabled:!bg-slate-200 disabled:!text-slate-400 disabled:!opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          <span className="sr-only">Save version</span>
        </Button>
      )}
      <button
        type="button"
        onClick={() => st.setPanelOpen(!panelOpen)}
        aria-pressed={panelOpen}
        aria-label="Toggle Properties panel"
        title={`${panelOpen ? "Hide" : "Show"} Properties panel (Ctrl/⌘+B)`}
        className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-100"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="3" width="14" height="12" rx="1.5" />
          <path d="M11.5 3v12" />
          {panelOpen && <rect x="11.5" y="3" width="4.5" height="12" fill="currentColor" stroke="none" opacity="0.35" />}
        </svg>
      </button>
      </div>

      {dialog === "info" && <DesignInfoModal onClose={close} />}
      {dialog === "save-version" && <SaveVersionModal onClose={close} />}
      {dialog === "dictionary" && <DataDictionaryModal onClose={close} />}
      {dialog === "history" && <VersionHistoryModal onClose={close} />}
      {dialog === "settings" && <SettingsModal onClose={close} />}
      {dialog === "sql" && <ExportSqlModal onClose={close} />}
      {dialog === "import" && (
        <ImportModal
          replacing
          onClose={close}
          onImport={({ meta: m, data, source }) => {
            // SQL carries no view settings: keep this design's own.
            if (source === "sql") data.settings = useEditor.getState().data.settings;
            useEditor.getState().replaceAll(data, m);
            close();
          }}
        />
      )}
    </header>
  );
}
