"use client";
import { useEffect, useState } from "react";
import { tableLayout } from "@/domain/layout";
import { allColumns, findColumn } from "@/domain/model";
import { columnMatches, groupMatches, normalizeQuery, tableNameMatches } from "@/domain/search";
import type { TableItem } from "@/domain/types";
import { buildTableMarkdown } from "@/lib/dataDictionary";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { ExportSqlModal } from "./ExportSqlModal";
import { TableCard } from "./TableCard";

/**
 * Shows one table with everything: all columns, expanded groups, attributes and descriptions, regardless of view settings.
 * It fills the canvas area (below the top header) and is not modal: the Properties panel next to it stays usable, and
 * clicking a column or group in the table selects it there.
 */
/** Keeps only the columns / groups matching `q` (see the rules in domain/search). */
function filterItems(items: TableItem[], q: string): TableItem[] {
  const out: TableItem[] = [];
  for (const it of items) {
    if (it.kind === "column") {
      if (columnMatches(it, q)) out.push(it);
    } else {
      const cols = it.columns.filter((c) => columnMatches(c, q));
      // A group that matches itself but has no matching column is shown alone.
      if (cols.length > 0 || groupMatches(it, q)) out.push({ ...it, columns: cols });
    }
  }
  return out;
}

export function TableDetailPanel() {
  const id = useEditor((s) => s.detailTableId);
  const data = useEditor((s) => s.data);
  const selection = useEditor((s) => s.selection);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  // Column groups start collapsed whenever a table is opened (adjusted during render to avoid a flash of the expanded state).
  const [initFor, setInitFor] = useState<string | null>(null);
  if (id !== initFor) {
    setInitFor(id);
    const t = data.tables.find((x) => x.id === id);
    setCollapsed(t ? t.items.filter((i) => i.kind === "group").map((g) => g.id) : []);
  }
  const [copied, setCopied] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const query = useEditor((s) => s.search);
  const close = () => useEditor.getState().openDetail(null);
  const table = data.tables.find((t) => t.id === id);

  // Opening a table selects it, so the Properties panel shows it right away.
  useEffect(() => {
    if (!id) return;
    const sel = useEditor.getState().selection;
    const inThis = sel && ((sel.type === "table" && sel.id === id) || ((sel.type === "column" || sel.type === "group") && sel.tableId === id));
    if (!inThis) useEditor.getState().select({ type: "table", id });
    setCopied(false);
  }, [id]);

  // Escape closes the view, unless a dialog or a text field has the focus.
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      useEditor.getState().openDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  if (!table) return null;

  const name = (tid: string, cid: string) => {
    const t = data.tables.find((x) => x.id === tid);
    return `${t?.name ?? "?"}.${findColumn(t, cid)?.name ?? "?"}`;
  };
  const group = data.tableGroups.find((g) => g.id === table.groupId);
  const columnGroups = table.items.filter((i) => i.kind === "group");
  const outgoing = data.relationships.filter((r) => r.fromTableId === table.id);
  const incoming = data.relationships.filter((r) => r.toTableId === table.id && r.fromTableId !== table.id);
  const refs = Object.fromEntries(outgoing.map((r) => [r.fromColumnId, name(r.toTableId, r.toColumnId)]));
  const selectedId = selection && (selection.type === "column" || selection.type === "group") && selection.tableId === table.id ? selection.id : null;

  const q = normalizeQuery(query);
  // Only matching columns / groups are shown; a table matched by name alone shows everything.
  const found = q ? filterItems(table.items, q) : table.items;
  const shownTable = q && (found.length > 0 || !tableNameMatches(table, q)) ? { ...table, items: found } : table;
  const layout = tableLayout(
    data,
    { ...shownTable, autoWidth: true },
    { viewMode: "full", hideGroups: false, showDescriptions: true, showAttributes: true, expandAll: true, detail: true, refs, maxDescWidth: 420, descriptionStyle: "column", collapsedIds: q ? [] : collapsed },
  );

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(buildTableMarkdown(data, table.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section aria-label={`Table ${table.name}`} className="absolute inset-0 z-20 flex flex-col bg-slate-50">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-4 py-2">
        <h2 className="text-base font-semibold">Table: {table.name}</h2>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600" title="Number of columns in this table (all groups included)">
          {allColumns(table).length} {allColumns(table).length === 1 ? "column" : "columns"}
        </span>
        {group && <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600" title={group.description}>Table group: <b>{group.name}</b></span>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={columnGroups.length === 0} onClick={() => setCollapsed(columnGroups.map((g) => g.id))}>Collapse groups</Button>
          <Button size="sm" disabled={columnGroups.length === 0} onClick={() => setCollapsed([])}>Unfold groups</Button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <Button size="sm" onClick={copyMarkdown} title="Copy the Markdown of this table (as in the data dictionary)">{copied ? "Copied ✓" : "Copy Markdown"}</Button>
          <Button size="sm" onClick={() => setSqlOpen(true)} title="Export this table and its foreign keys as SQL">Export SQL</Button>
        </div>
        <Button className="ml-auto" variant="primary" onClick={close} title="Close (Esc)">Close</Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-4">
        {q && shownTable.items.length === 0 && <p className="mb-3 text-center text-sm text-slate-500">No column or group matches “{query.trim()}”.</p>}
        <div className="mx-auto w-fit rounded-md shadow ring-1 ring-slate-300">
          <TableCard
            table={shownTable} totalColumns={allColumns(table).length} layout={layout} highlight={q} toggleWholeRow selectedId={selectedId}
            onSelect={(t) => {
              // Group rows both select and toggle; the Properties panel follows the selection.
              useEditor.getState().select(t.kind === "table" ? { type: "table", id: table.id } : { type: t.kind, tableId: table.id, id: t.id });
            }}
            onToggleGroup={(gid, c) => setCollapsed((cur) => (c ? [...cur, gid] : cur.filter((x) => x !== gid)))}
          />
        </div>
        {(outgoing.length > 0 || incoming.length > 0) && (
          <div className="mx-auto mt-4 w-fit space-y-1 text-xs text-slate-600">
            {outgoing.map((r) => (
              <p key={r.id} className="mono">{name(r.fromTableId, r.fromColumnId)} → {name(r.toTableId, r.toColumnId)}{r.label ? ` (${r.label})` : ""} · on delete {r.onDelete.toLowerCase()}</p>
            ))}
            {incoming.map((r) => (
              <p key={r.id} className="mono">{name(r.fromTableId, r.fromColumnId)} → {name(r.toTableId, r.toColumnId)}{r.label ? ` (${r.label})` : ""} <span className="text-slate-400">(referenced by)</span></p>
            ))}
          </div>
        )}
      </div>
      {sqlOpen && <ExportSqlModal tableId={table.id} onClose={() => setSqlOpen(false)} />}
    </section>
  );
}
