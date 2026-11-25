"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { tableLayout } from "@/domain/layout";
import { GRID } from "@/domain/factory";
import { tableBoxes } from "@/domain/routing";
import { normalizeQuery } from "@/domain/search";
import { selectedTableIds, useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { RelationshipLayer } from "./RelationshipLayer";
import { TableNode } from "./TableNode";

const MIN_ZOOM = 0.2, MAX_ZOOM = 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null);
  const tables = useEditor((s) => s.data.tables);
  const showGrid = useEditor((s) => s.data.settings.showGrid);
  const view = useEditor((s) => s.view);
  const viewing = useEditor((s) => s.viewing);
  const { setView, select, selectTables, addTable } = useEditor.getState();
  // Selection rectangle (screen coordinates inside the canvas) and Space-to-pan.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]");
    const set = (v: boolean) => { spaceRef.current = v; setSpaceDown(v); };
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target) && !document.querySelector("[role=dialog]")) { set(true); if (e.target === document.body) e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") set(false); };
    const blur = () => set(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = useEditor.getState().view;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  // Wheel: ctrl/meta (or pinch) zooms around the cursor, plain wheel pans.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = useEditor.getState().view;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM);
        const k = zoom / v.zoom;
        setView({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
      } else {
        setView({ x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const onBgDown = (e: React.PointerEvent) => {
    const el = ref.current!;
    // Pan: Space + drag, or the middle mouse button.
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      const start = { px: e.clientX, py: e.clientY, ...useEditor.getState().view };
      const move = (ev: PointerEvent) => setView({ x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py });
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    if (e.button !== 0) return;

    // Drag on empty canvas: selection rectangle (Ctrl / Cmd / Shift adds to the current selection).
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? selectedTableIds(useEditor.getState().selection) : [];
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    let moved = false;
    // No text highlighting while rectangle-selecting (restored on release, so copying text elsewhere still works).
    window.getSelection()?.removeAllRanges();
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
      if (!moved && Math.abs(cx - sx) + Math.abs(cy - sy) < 4) return;
      moved = true;
      setMarquee({ x1: sx, y1: sy, x2: cx, y2: cy });
      const { view: v, data } = useEditor.getState();
      const x1 = (Math.min(sx, cx) - v.x) / v.zoom, x2 = (Math.max(sx, cx) - v.x) / v.zoom;
      const y1 = (Math.min(sy, cy) - v.y) / v.zoom, y2 = (Math.max(sy, cy) - v.y) / v.zoom;
      const hit = [...tableBoxes(data, normalizeQuery(useEditor.getState().search))].filter(([, b]) => b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1).map(([id]) => id);
      selectTables([...base, ...hit]); // live: tables light up while dragging
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = prevSelect;
      setMarquee(null);
      if (!moved && !additive) select(null); // a plain click on empty canvas clears the selection
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const zoomBy = (f: number) => {
    const el = ref.current!;
    const v = useEditor.getState().view;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    const zoom = clamp(v.zoom * f, MIN_ZOOM, MAX_ZOOM);
    const k = zoom / v.zoom;
    setView({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  };

  const fit = () => {
    const el = ref.current!;
    const { data } = useEditor.getState();
    if (!data.tables.length) return setView({ x: 40, y: 40, zoom: 1 });
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const t of data.tables) {
      const l = tableLayout(data, t);
      x1 = Math.min(x1, t.x); y1 = Math.min(y1, t.y);
      x2 = Math.max(x2, t.x + l.width); y2 = Math.max(y2, t.y + l.height);
    }
    const pad = 60;
    const zoom = clamp(Math.min((el.clientWidth - pad * 2) / (x2 - x1), (el.clientHeight - pad * 2) / (y2 - y1)), MIN_ZOOM, 1);
    setView({ zoom, x: (el.clientWidth - (x2 - x1) * zoom) / 2 - x1 * zoom, y: (el.clientHeight - (y2 - y1) * zoom) / 2 - y1 * zoom });
  };

  const add = () => {
    const el = ref.current!;
    const p = toWorld(el.getBoundingClientRect().left + el.clientWidth / 2 - 120, el.getBoundingClientRect().top + el.clientHeight / 2 - 60);
    addTable(p.x, p.y);
  };

  const minor = GRID * view.zoom, major = GRID * 5 * view.zoom;
  const gridStyle = showGrid
    ? {
        backgroundImage: [
          minor >= 6 ? "linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)" : "",
          "linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)",
        ].filter(Boolean).join(","),
        backgroundSize: [minor >= 6 ? `${minor}px ${minor}px, ${minor}px ${minor}px` : "", `${major}px ${major}px, ${major}px ${major}px`].filter(Boolean).join(","),
        backgroundPosition: `${view.x}px ${view.y}px`,
      }
    : {};

  return (
    <div ref={ref} onPointerDown={onBgDown} className={`relative flex-1 touch-none overflow-hidden bg-slate-50 ${spaceDown ? "cursor-grab" : ""}`} style={gridStyle}>
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: "0 0" }}>
        <RelationshipLayer toWorld={toWorld} />
        {tables.map((t) => <TableNode key={t.id} table={t} />)}
        {/* The selected line's label and adjusting dot are drawn above everything, tables included, so they can always be grabbed. */}
        <RelationshipLayer toWorld={toWorld} layer="over" />
      </div>

      {marquee && (
        <div
          className="pointer-events-none absolute border border-blue-500 bg-blue-500/10"
          style={{ left: Math.min(marquee.x1, marquee.x2), top: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1), height: Math.abs(marquee.y2 - marquee.y1) }}
        />
      )}

      {tables.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Empty design — click “Add table” or import SQL / JSON from the File menu.
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow" onPointerDown={(e) => e.stopPropagation()}>
        <Button variant="primary" size="sm" onClick={add} disabled={!!viewing} title={viewing ? "Read-only: viewing an old version" : undefined}>+ Add table</Button>
        <Button variant="ghost" size="sm" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</Button>
        <span className="w-10 text-center text-xs text-slate-500">{Math.round(view.zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</Button>
        <Button variant="ghost" size="sm" onClick={fit}>Fit</Button>
        <span className="hidden px-1 text-[11px] text-slate-400 lg:inline" title="Drag on empty canvas to select tables · Ctrl/⌘+click to add · Ctrl/⌘+A selects all">
          Drag: select · Space+drag: pan
        </span>
      </div>
    </div>
  );
}
