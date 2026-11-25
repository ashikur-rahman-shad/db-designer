"use client";
import { useEffect, useRef, useState } from "react";

export type MenuEntry =
  | { type?: "item"; label: string; onClick: () => void; checked?: boolean; disabled?: boolean }
  /** An item that opens a flyout of sub-items on hover (or keyboard focus). */
  | { type: "submenu"; label: string; items: MenuEntry[]; disabled?: boolean }
  | { type: "separator" };

export function MenuDropdown({ label, entries }: { label: string; entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded px-2 py-1 text-sm hover:bg-slate-100 ${open ? "bg-slate-100" : ""}`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 min-w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <MenuItems entries={entries} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function MenuItems({ entries, onPick }: { entries: MenuEntry[]; onPick: () => void }) {
  return (
    <>
      {entries.map((e, i) =>
        e.type === "separator" ? (
          <div key={i} className="my-1 border-t border-slate-200" />
        ) : e.type === "submenu" ? (
          <SubMenu key={i} entry={e} onPick={onPick} />
        ) : (
          <button
            key={i}
            type="button"
            disabled={e.disabled}
            onClick={() => { onPick(); e.onClick(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-40"
          >
            <span className="w-3 text-blue-600">{e.checked ? "✓" : ""}</span>
            {e.label}
          </button>
        ),
      )}
    </>
  );
}

function SubMenu({ entry, onPick }: { entry: Extract<MenuEntry, { type: "submenu" }>; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={entry.disabled}
        onClick={() => setOpen(true)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-40 ${open ? "bg-slate-100" : ""}`}
      >
        <span className="w-3" />
        <span className="flex-1">{entry.label}</span>
        <span className="text-slate-400">▸</span>
      </button>
      {open && !entry.disabled && (
        <div className="absolute left-full top-0 z-50 min-w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <MenuItems entries={entry.items} onPick={onPick} />
        </div>
      )}
    </div>
  );
}
