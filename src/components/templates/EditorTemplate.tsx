"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import type { Design, VersionInfo, ViewingVersion } from "@/domain/types";
import { normalizeViewOptions, sameViewOptions, type ViewOptions } from "@/domain/viewOptions";
import { hasUnsavedChanges, saveNow, scheduleSave } from "@/lib/designApi";
import { saveViewOptions } from "@/lib/viewOptionsApi";
import { useEditor } from "@/store/editorStore";
import { Canvas } from "../organisms/Canvas";
import { MenuBar } from "../organisms/MenuBar";
import { SidePanel } from "../organisms/SidePanel";
import { TableDetailPanel } from "../organisms/TableDetailPanel";

const SAVE_DELAY = 700;

const currentViewOptions = (): ViewOptions => {
  const s = useEditor.getState();
  return normalizeViewOptions({ ...s.data.settings, panelOpen: s.panelOpen, undoLimit: s.undoLimit });
};

export function EditorTemplate({
  design, versionInfo, viewing, viewOptions,
}: { design: Design; versionInfo: VersionInfo; viewing?: ViewingVersion; viewOptions: ViewOptions | null }) {
  // Hydrate the (global) store before the first paint. Children only render once it holds this
  // design, so they never see stale data, and nothing is written to the store during render.
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    // Remembered view options win; the very first time (none stored yet) seed them from this design.
    useEditor.getState().load(design, versionInfo, viewing, viewOptions ?? normalizeViewOptions({ ...design.data.settings, panelOpen: true }));
    if (!viewOptions) void saveViewOptions(currentViewOptions());
    // Restore this diagram's pan / zoom (kept per diagram in this browser), so a reload never moves the view.
    try {
      const v = JSON.parse(localStorage.getItem(`dbd.view.${design.id}`) ?? "null");
      const ok = v && [v.x, v.y, v.zoom].every((n: unknown) => typeof n === "number" && Number.isFinite(n));
      useEditor.getState().setView(ok ? { x: v.x, y: v.y, zoom: v.zoom } : { x: 40, y: 40, zoom: 1 });
    } catch { useEditor.getState().setView({ x: 40, y: 40, zoom: 1 }); }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const viewingNow = useEditor((s) => s.viewing);

  // Autosave runs in the background: a store subscription (no React re-render per edit) asks for a save,
  // and lib/designApi keeps it to one request at a time with the latest state.
  useEffect(() => {
    const unsub = useEditor.subscribe((s, prev) => { if (s.rev !== prev.rev && s.rev !== 0) scheduleSave(); });
    const onHide = () => { if (document.visibilityState === "hidden" && hasUnsavedChanges()) void saveNow(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { unsub(); document.removeEventListener("visibilitychange", onHide); };
  }, []);

  // Remember the pan / zoom of this diagram (debounced; storage failures are ignored).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const write = () => { try { const s = useEditor.getState(); localStorage.setItem(`dbd.view.${s.id}`, JSON.stringify(s.view)); } catch { /* private mode etc. */ } };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.view === prev.view || !s.id) return;
      clearTimeout(t);
      t = setTimeout(write, 250);
    });
    return () => { unsub(); if (t !== undefined) { clearTimeout(t); write(); } };
  }, []);

  // View options (grid, view mode, panel, ...) are remembered for the user in the database, for every diagram.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      void saveViewOptions(currentViewOptions());
    };
    const unsub = useEditor.subscribe((s, prev) => {
      const now = normalizeViewOptions({ ...s.data.settings, panelOpen: s.panelOpen, undoLimit: s.undoLimit });
      const before = normalizeViewOptions({ ...prev.data.settings, panelOpen: prev.panelOpen, undoLimit: prev.undoLimit });
      if (sameViewOptions(now, before)) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, 250);
    });
    // Ctrl/Cmd+B toggles the Properties panel (like VS Code's sidebar).
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const s = useEditor.getState();
        s.setPanelOpen(!s.panelOpen);
      }
    };
    // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo (text fields and dialogs keep their own undo).
    const onUndo = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const redo = (k === "z" && e.shiftKey) || (k === "y" && !e.shiftKey && !e.metaKey);
      if (!redo && !(k === "z" && !e.shiftKey)) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      if (redo) useEditor.getState().redo(); else useEditor.getState().undo();
    };
    window.addEventListener("keydown", onUndo);
    // Ctrl/Cmd+A selects every table (but never steals select-all from text fields or open dialogs).
    const onSelectAll = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "a") return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      useEditor.getState().selectAllTables();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onSelectAll);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keydown", onSelectAll); window.removeEventListener("keydown", onUndo); unsub(); flush(); };
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  if (!ready) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">Loading designer…</div>;

  return (
    <div className="flex h-screen flex-col">
      <MenuBar />
      {viewingNow && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <b>Viewing version {viewingNow.version}</b>
          <span>saved {new Date(viewingNow.createdAt).toLocaleString()}</span>
          {viewingNow.note && <span className="truncate">· “{viewingNow.note}”</span>}
          <span className="ml-auto">Read-only — nothing you do here is saved. The latest design is unchanged.</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* The table view covers the canvas only: the header above and the Properties panel beside it stay usable. */}
        <div className="relative flex min-w-0 flex-1">
          <Canvas />
          <TableDetailPanel />
        </div>
        <SidePanel />
      </div>
    </div>
  );
}
