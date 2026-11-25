"use client";
import { Fragment, type HTMLAttributes, type ReactNode } from "react";
import { HEADER_H, LINE_H, type TableLayout } from "@/domain/layout";
import { allColumns } from "@/domain/model";
import type { TableModel } from "@/domain/types";
import { hasTextSelection } from "@/lib/selection";

export type CardTarget = { kind: "table" } | { kind: "column"; id: string } | { kind: "group"; id: string };

export interface TableCardProps {
  table: TableModel;
  layout: TableLayout;
  headerProps?: HTMLAttributes<HTMLDivElement>;
  /** Pointer-down on a part of the table (header / description = table, a row = that column or group). */
  onSelect?: (target: CardTarget, e: React.PointerEvent) => void;
  /** Highlighted column or group id. */
  selectedId?: string | null;
  onToggleGroup?: (groupId: string, collapsed: boolean) => void;
  /** true (detail dialog): the whole group row toggles. false (canvas): only the ▶/▼ chevron toggles; the row selects. */
  toggleWholeRow?: boolean;
  /** Text to highlight (case-insensitive) in names, descriptions, enum values and defaults. */
  highlight?: string;
  /** Column count shown after the name; defaults to the columns of `table` (pass the full count when it is filtered). */
  totalColumns?: number;
}

function mark(text: string, q: string): ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, i)) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(<mark key={at} className="rounded-sm bg-yellow-300 text-slate-900">{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  if (i === 0) return text;
  if (i < text.length) parts.push(text.slice(i));
  return parts.map((p, k) => <Fragment key={k}>{p}</Fragment>);
}

const TAG_TITLES: Record<string, string> = { UQ: "Unique (column flag or single-column unique index)", CK: "Part of a composite unique index (unique only together with the other columns)", IX: "Indexed", NN: "Not null", AI: "Identity / auto increment" };
const lineStyle = { lineHeight: `${LINE_H}px` } as const;
const preStyle = { ...lineStyle, whiteSpace: "pre" } as const;
const clip = "overflow-hidden text-ellipsis whitespace-nowrap";
const SELECTED = "bg-blue-500/10 ring-1 ring-inset ring-blue-500";

const Pill = ({ children, title, tone = "gray", q = "" }: { children: string; title?: string; tone?: "gray" | "enum"; q?: string }) => (
  <span
    title={title}
    className={`rounded px-1 text-[9px] font-semibold ${tone === "enum" ? "bg-indigo-100 text-indigo-700" : "bg-black/[0.08] text-slate-600"}`}
  >
    {mark(children, q)}
  </span>
);

/**
 * Presentational table: header + tabular rows.
 * Key cell (stacked): PK / FK / UQ NN AI. Then name, type, and either (canvas) the description and enum pills
 * under the name, or (detail dialog) separate description / enum / details columns.
 * Every row is positioned from the precomputed layout and long text is pre-wrapped into explicit lines,
 * so what is drawn always matches what the line router assumes.
 */
export function TableCard({ table, layout, headerProps, onSelect, selectedId, onToggleGroup, toggleWholeRow = false, highlight = "", totalColumns }: TableCardProps) {
  const q = highlight.trim().toLowerCase();
  const cols = new Map(allColumns(table).map((c) => [c.id, c]));
  const groups = new Map(table.items.flatMap((i) => (i.kind === "group" ? [[i.id, i] as const] : [])));
  const w = layout.cols;
  const order = (["key", "name", "type", w.desc > 0 && "desc", w.enum > 0 && "enum", w.details > 0 && "details"] as const).filter(Boolean) as string[];
  const widths: Record<string, number> = { key: w.key, name: w.name, type: w.type, desc: w.desc, enum: w.enum, details: w.details };
  const template = order.map((n) => `${widths[n]}px`).join(" ");
  const col = (n: string) => order.indexOf(n) + 1;
  const cell = "border-l border-black/[0.06] px-1.5 pt-2";

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: layout.width, height: layout.height, background: `color-mix(in srgb, ${table.color} 9%, white)` }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect?.({ kind: "table" }, e); }}
    >
      <div
        {...headerProps}
        className={`flex items-center px-3 text-sm font-semibold text-white ${headerProps?.className ?? ""}`}
        style={{ height: HEADER_H, background: table.color, ...headerProps?.style }}
      >
        <span className={clip}>{mark(table.name, q)}</span>
        <span className="ml-1.5 shrink-0 text-[10px] font-normal text-white/60" title="Number of columns">({totalColumns ?? allColumns(table).length})</span>
      </div>

      {layout.rows.map((row) => {
        const pos = { top: row.top, height: row.height };
        if (row.type === "tabledesc") {
          return (
            <div
              key={row.id}
              onPointerDown={(e) => onSelect?.({ kind: "table" }, e)}
              className="absolute inset-x-0 bg-black/[0.04] px-3 pt-1.5 text-[11px] italic text-slate-600"
              style={{ ...pos, ...preStyle }}
              title={table.description}
            >
              {mark(row.lines.join("\n"), q)}
            </div>
          );
        }
        if (row.type === "empty") {
          return (
            <div key={row.id} onPointerDown={(e) => onSelect?.({ kind: "table" }, e)} className="absolute inset-x-0 px-3 text-xs italic leading-[30px] text-slate-400" style={pos}>
              No columns
            </div>
          );
        }
        if (row.type === "group") {
          const g = groups.get(row.id)!;
          const toggle = () => onToggleGroup?.(g.id, !row.collapsed);
          return (
            <div
              key={row.id}
              onPointerDown={(e) => onSelect?.({ kind: "group", id: g.id }, e)}
              // In the dialog the whole row toggles; a click that ends a text selection must not, so text can be copied.
              onClick={toggleWholeRow && onToggleGroup ? () => { if (!hasTextSelection()) toggle(); } : undefined}
              title={g.description || (onToggleGroup && toggleWholeRow ? "Click to collapse / expand" : undefined)}
              className={`absolute inset-x-0 border-y border-black/10 px-2 pt-2 text-xs ${toggleWholeRow && onToggleGroup ? "cursor-pointer hover:brightness-95" : ""} ${selectedId === g.id ? SELECTED : ""}`}
              style={{ ...pos, background: `color-mix(in srgb, ${table.color} 20%, white)` }}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-700" style={lineStyle}>
                <span
                  onClick={!toggleWholeRow && onToggleGroup ? toggle : undefined}
                  title={!toggleWholeRow && onToggleGroup ? "Collapse / expand" : undefined}
                  className={`-my-1 -ml-1 w-5 py-1 text-center text-[9px] ${!toggleWholeRow && onToggleGroup ? "cursor-pointer rounded hover:bg-black/10" : ""}`}
                >
                  {row.collapsed ? "▶" : "▼"}
                </span>
                <span className={clip}>{mark(g.name, q)}</span>
                <span className="ml-auto font-normal text-slate-500">{row.hiddenCount}</span>
              </div>
              {row.descLines.length > 0 && (
                <div className="pl-[18px] text-[10px] italic text-slate-500" style={preStyle}>{mark(row.descLines.join("\n"), q)}</div>
              )}
            </div>
          );
        }

        const c = cols.get(row.id)!;
        const inlineExtra = w.desc === 0 && (row.descLines.length > 0 || (w.enum === 0 && row.enumLines.length > 0));
        const span = inlineExtra ? "1 / span 2" : undefined; // key cell spans the extra (description / enum) line too
        const r1 = inlineExtra ? 1 : undefined;
        return (
          <div
            key={row.id}
            onPointerDown={(e) => onSelect?.({ kind: "column", id: c.id }, e)}
            className={`absolute inset-x-0 grid border-b border-black/[0.06] text-xs ${selectedId === c.id ? SELECTED : ""}`}
            style={{ ...pos, gridTemplateColumns: template, gridTemplateRows: inlineExtra ? `${LINE_H + 8}px 1fr` : undefined }}
          >
            {/* key cell: PK, then FK, then UQ / NN / AI, each on its own line */}
            <div className="px-1 pt-2" style={{ gridColumn: 1, gridRow: span }}>
              {row.pk && <div className="text-[9px] font-bold text-amber-600" style={lineStyle} title={row.pkLabel === "PK" ? "Primary key" : "Part of the composite primary key"}>{row.pkLabel}</div>}
              {row.fk && <div className="text-[9px] font-bold text-sky-600" style={lineStyle}>FK</div>}
              {row.tags.length > 0 && (
                <div className="flex gap-[3px]" style={lineStyle}>
                  {row.tags.map((t) => <Pill key={t} title={TAG_TITLES[t]}>{t}</Pill>)}
                </div>
              )}
            </div>
            <div className={`${cell} mono ${clip} ${c.primaryKey ? "font-semibold" : ""}`} style={{ ...lineStyle, gridColumn: col("name"), gridRow: r1 }} title={c.name}>{mark(c.name, q)}</div>
            <div className={`${cell} mono ${clip} text-[10px] text-slate-500`} style={{ ...lineStyle, gridColumn: col("type"), gridRow: r1 }} title={c.dataType}>{c.dataType}</div>

            {inlineExtra && (
              <div className="border-l border-black/[0.06] px-1.5" style={{ gridColumn: `${col("name")} / span 2`, gridRow: 2 }}>
                {row.descLines.length > 0 && <div className="text-[10px] text-slate-400" style={preStyle}>{mark(row.descLines.join("\n"), q)}</div>}
                {w.enum === 0 && row.enumLines.map((line, i) => (
                  <div key={i} className="flex gap-[3px]" style={lineStyle}>{line.map((v) => <Pill key={v} tone="enum" q={q}>{v}</Pill>)}</div>
                ))}
              </div>
            )}

            {w.desc > 0 && (
              <div className={`${cell} text-[10px] italic text-slate-500`} style={{ ...preStyle, gridColumn: col("desc") }}>{mark(row.descLines.join("\n"), q)}</div>
            )}
            {w.enum > 0 && (
              <div className={cell} style={{ gridColumn: col("enum") }}>
                {row.enumLines.map((line, i) => (
                  <div key={i} className="flex gap-[3px]" style={lineStyle}>{line.map((v) => <Pill key={v} tone="enum" q={q}>{v}</Pill>)}</div>
                ))}
              </div>
            )}
            {w.details > 0 && (
              <div className={`${cell} text-[10px] text-slate-600`} style={{ ...preStyle, gridColumn: col("details") }}>{mark(row.detailLines.join("\n"), q)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
