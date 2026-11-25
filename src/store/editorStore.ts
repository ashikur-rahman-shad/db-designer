import { create } from "zustand";
import { current, original } from "immer";
import { immer } from "zustand/middleware/immer";
import { GRID, newColumn, newGroup, newIndex, newRelationship, newTable, newTableGroup, snap } from "@/domain/factory";
import { findColumn, pruneIndexes, pruneRelationships } from "@/domain/model";
import { DEFAULT_UNDO_LIMIT, MAX_UNDO_LIMIT, normalizeViewOptions, pickViewSettings, type ViewOptions } from "@/domain/viewOptions";
import type {
  Column, ColumnGroup, Design, DesignData, DesignMeta, DesignSettings, Relationship, TableGroup, TableIndex, TableItem, TableModel, VersionInfo, ViewingVersion,
} from "@/domain/types";

/**
 * What is selected on the canvas. A table (header / description) shows all its properties;
 * a column or a column group shows only its own properties.
 */
export type Selection =
  | { type: "table" | "relationship"; id: string }
  | { type: "column" | "group"; tableId: string; id: string }
  /** Several tables (Ctrl+click, Ctrl+A or the selection rectangle). Always 2 or more ids. */
  | { type: "tables"; ids: string[] }
  | null;

/** Table ids implied by a selection (a column / group counts as its table). */
export function selectedTableIds(sel: Selection): string[] {
  if (!sel) return [];
  if (sel.type === "table") return [sel.id];
  if (sel.type === "tables") return sel.ids;
  if (sel.type === "column" || sel.type === "group") return [sel.tableId];
  return [];
}
/** One undo step: the design content before a change. */
interface Snapshot {
  meta: DesignMeta;
  data: DesignData;
}

/** Edits closer together than this (typing, dragging) are merged into a single undo step. */
const UNDO_MERGE_MS = 600;

/** Valid undo limit (0 = undo disabled), or `fallback` for junk. */
export function normalizeUndoLimit(v: unknown, fallback = DEFAULT_UNDO_LIMIT): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_UNDO_LIMIT, Math.max(0, Math.round(v))) : fallback;
}

function selectionStillValid(sel: Selection, data: DesignData): boolean {
  if (!sel) return true;
  if (sel.type === "relationship") return data.relationships.some((r) => r.id === sel.id);
  if (sel.type === "tables") return sel.ids.every((id) => data.tables.some((t) => t.id === id));
  if (!("tableId" in sel)) return data.tables.some((x) => x.id === sel.id);
  const t = data.tables.find((x) => x.id === sel.tableId);
  if (!t) return false;
  return t.items.some((i) => i.id === sel.id || (i.kind === "group" && i.columns.some((c) => c.id === sel.id)));
}

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

interface EditorState {
  id: string;
  meta: DesignMeta;
  data: DesignData;
  /** Incremented on every persisted change; drives autosave. */
  rev: number;
  /** Incremented on every load(); tells autosave which loaded design a `rev` belongs to. */
  loadSeq: number;
  saveStatus: SaveStatus;
  selection: Selection;
  view: { x: number; y: number; zoom: number };
  /** Table whose detail dialog is open (not persisted). */
  detailTableId: string | null;
  /** Whether the Properties panel is visible (UI preference, not saved with the design). */
  panelOpen: boolean;
  /** Text typed in the top-bar search (not persisted); "" = no search. */
  search: string;
  setSearch(q: string): void;
  versionInfo: VersionInfo;
  /** When the design content last changed (ISO time): the saved time at load, then the time of each edit. */
  updatedAt: string;
  /** Undo / redo history (design content only; view state is never part of it). */
  past: Snapshot[];
  future: Snapshot[];
  /** Maximum number of undo steps kept (0 = undo / redo disabled). A user preference. */
  undoLimit: number;
  setUndoLimit(n: number): void;
  undo(): void;
  redo(): void;
  /** Set while an old version is open: the editor is read-only and never saves. */
  viewing: ViewingVersion | null;

  openDetail(id: string | null): void;
  /** Relationship under the pointer (line or label): both drawing layers highlight it. */
  hoverRelId: string | null;
  setHoverRel(id: string | null): void;
  setPanelOpen(open: boolean): void;
  /**
   * Replace the editor content. `viewOptions` (the user's remembered view options) override the view
   * fields of the design; omitted = keep the current ones. Column groups always start collapsed.
   */
  load(design: Design, versionInfo?: VersionInfo, viewing?: ViewingVersion | null, viewOptions?: ViewOptions): void;
  setVersionInfo(v: VersionInfo): void;
  setSaveStatus(s: SaveStatus): void;
  setView(v: Partial<EditorState["view"]>): void;
  select(sel: Selection): void;
  /** Select exactly these tables (0 = nothing, 1 = a single table, 2+ = a multi-selection). */
  selectTables(ids: string[]): void;
  /** Ctrl+click: add the table to / remove it from the selected tables. */
  toggleTableSelection(id: string): void;
  selectAllTables(): void;
  setMeta(m: Partial<DesignMeta>): void;
  replaceAll(data: DesignData, meta?: Partial<DesignMeta>): void;

  addTable(x: number, y: number): string;
  updateTable(id: string, patch: Partial<Omit<TableModel, "id" | "items">>): void;
  moveTable(id: string, x: number, y: number): void;
  /** Move several tables at once (one change, positions snapped to the grid). */
  moveTables(entries: { id: string; x: number; y: number }[]): void;
  updateTables(ids: string[], patch: Partial<Pick<TableModel, "color">>): void;
  setTablesGroup(ids: string[], groupId: string | null): void;
  deleteTables(ids: string[]): void;
  deleteTable(id: string): void;

  addColumn(tableId: string, groupId?: string): string;
  updateColumn(tableId: string, colId: string, patch: Partial<Omit<Column, "id" | "kind">>): void;
  deleteColumn(tableId: string, colId: string): void;
  /** Add an index on the given columns (default: none yet; the caller then picks columns). */
  addIndex(tableId: string, init?: Partial<Pick<TableIndex, "name" | "columnIds" | "unique">>): string;
  updateIndex(tableId: string, indexId: string, patch: Partial<Pick<TableIndex, "name" | "columnIds" | "unique">>): void;
  deleteIndex(tableId: string, indexId: string): void;
  /** Make exactly these columns (in table order) the primary key: more than one = a composite primary key. */
  setPrimaryKey(tableId: string, columnIds: string[]): void;
  /** Reorder a column within its container (table root or group). */
  moveColumn(tableId: string, colId: string, dir: -1 | 1): void;
  /**
   * Move a column (or a top-level group) into `containerId` (a group id, or null for the table root),
   * placing it before `beforeId` (null = at the end). Groups cannot be nested.
   */
  moveNode(tableId: string, nodeId: string, containerId: string | null, beforeId: string | null): void;
  moveColumnToGroup(tableId: string, colId: string, groupId: string | null): void;

  addGroup(tableId: string): void;
  updateGroup(tableId: string, groupId: string, patch: Partial<Pick<ColumnGroup, "name" | "description" | "collapsed">>): void;
  /** Removes the group; its columns are kept and become ungrouped. */
  deleteGroup(tableId: string, groupId: string): void;
  moveItem(tableId: string, itemId: string, dir: -1 | 1): void;

  setForeignKey(tableId: string, colId: string, target: { tableId: string; columnId: string } | null): void;
  updateRelationship(id: string, patch: Partial<Omit<Relationship, "id">>): void;
  deleteRelationship(id: string): void;

  updateSettings(patch: Partial<DesignSettings>): void;

  /** Collapse / unfold every column group in every table (persisted with the design). */
  setAllColumnGroupsCollapsed(collapsed: boolean): void;

  /** Table groups (named sets of tables). */
  addTableGroup(name: string, description?: string): string;
  updateTableGroup(id: string, patch: Partial<Pick<TableGroup, "name" | "description">>): void;
  /** Deleting a group leaves its tables ungrouped. */
  deleteTableGroup(id: string): void;
  setTableGroup(tableId: string, groupId: string | null): void;
}

export const useEditor = create<EditorState>()(
  immer((set, get) => {
    let lastEditAt = 0;
    /** Persisted mutation: bumps rev and marks the document dirty. */
    /**
     * Change that is never saved or counted as an edit: view state (grid, collapsed groups, ...).
     * Allowed while an old version is open.
     */
    const transient = (fn: (s: EditorState) => void) => set((s) => { fn(s); });
    const mutate = (fn: (s: EditorState) => void, opts: { localInViewing?: boolean } = {}) =>
      set((s) => {
        // An old version is read-only: only `localInViewing` changes may apply (locally, never saved).
        if (s.viewing) {
          if (opts.localInViewing) fn(s);
          return;
        }
        // Undo history: remember the content before this edit (edits in quick succession share one step).
        const now = Date.now();
        if (s.undoLimit > 0 && (s.past.length === 0 || s.future.length > 0 || now - lastEditAt > UNDO_MERGE_MS)) {
          s.past.push({ meta: original(s.meta) ?? s.meta, data: original(s.data) ?? s.data });
          if (s.past.length > s.undoLimit) s.past.splice(0, s.past.length - s.undoLimit);
        }
        lastEditAt = now;
        s.future = [];
        fn(s);
        s.rev++;
        // While a save is running the status stays "saving": the follow-up save picks these changes up.
        if (s.saveStatus !== "saving") s.saveStatus = "dirty";
        s.versionInfo.changedSinceVersion = true;
        s.updatedAt = new Date().toISOString();
      });
    const table = (s: EditorState, id: string) => s.data.tables.find((t) => t.id === id);

    /** Step back (`past`) or forward (`future`) in the history. A step is a persisted change like any edit. */
    const travel = (dir: "past" | "future") => {
      const cur = get();
      if (cur.viewing || cur.undoLimit <= 0 || cur[dir].length === 0) return;
      set((s) => {
        const stack = dir === "past" ? s.past : s.future;
        const target = current(stack.pop()!);
        (dir === "past" ? s.future : s.past).push({ meta: original(s.meta) ?? s.meta, data: original(s.data) ?? s.data });
        const data = structuredClone(target.data);
        // View state is not undone: keep the current view settings and which column groups are collapsed.
        Object.assign(data.settings, pickViewSettings(s.data.settings));
        const collapsed = new Map(s.data.tables.flatMap((t) => t.items.flatMap((i) => (i.kind === "group" ? [[i.id, i.collapsed] as const] : []))));
        for (const t of data.tables) for (const i of t.items) if (i.kind === "group") i.collapsed = collapsed.get(i.id) ?? true;
        s.data = data;
        s.meta = structuredClone(target.meta);
        if (!selectionStillValid(s.selection, data)) s.selection = null;
        if (s.detailTableId && !data.tables.some((t) => t.id === s.detailTableId)) s.detailTableId = null;
        s.rev++;
        lastEditAt = 0;
        if (s.saveStatus !== "saving") s.saveStatus = "dirty";
        s.versionInfo.changedSinceVersion = true;
        s.updatedAt = new Date().toISOString();
      });
    };

    return {
      id: "",
      meta: { name: "", shortDescription: "", longDescription: "" },
      data: { tableGroups: [], tables: [], relationships: [], settings: {} as DesignSettings },
      rev: 0,
      loadSeq: 0,
      saveStatus: "saved",
      selection: null,
      view: { x: 40, y: 40, zoom: 1 },
      detailTableId: null,
      hoverRelId: null,
      setHoverRel: (id) => set((s) => { if (s.hoverRelId !== id) s.hoverRelId = id; }),
      panelOpen: true,
      search: "",
      setSearch: (q) => set((s) => { s.search = q; }),
      versionInfo: { latest: 0, changedSinceVersion: true },
      updatedAt: new Date().toISOString(),
      viewing: null,
      past: [],
      future: [],
      undoLimit: DEFAULT_UNDO_LIMIT,
      setUndoLimit: (n) =>
        set((s) => {
          s.undoLimit = normalizeUndoLimit(n, s.undoLimit);
          if (s.past.length > s.undoLimit) s.past.splice(0, s.past.length - s.undoLimit);
          if (s.future.length > s.undoLimit) s.future.splice(s.undoLimit);
        }),
      undo: () => travel("past"),
      redo: () => travel("future"),
      setVersionInfo: (v) => set((s) => { s.versionInfo = v; }),
      setPanelOpen: (open) => set((s) => { s.panelOpen = open; }),
      openDetail: (id) => set((s) => { s.detailTableId = id; }),

      load: (d, versionInfo, viewing, viewOptions) =>
        set((s) => {
          const vo = viewOptions ?? normalizeViewOptions({ ...s.data.settings, panelOpen: s.panelOpen });
          if (versionInfo) s.versionInfo = versionInfo;
          s.viewing = viewing ?? null;
          s.id = d.id;
          s.updatedAt = d.updatedAt;
          s.meta = { name: d.name, shortDescription: d.shortDescription, longDescription: d.longDescription };
          const data = structuredClone(d.data);
          Object.assign(data.settings, pickViewSettings(vo));
          // Diagrams open with their column groups collapsed (a view state, not saved with the design).
          for (const t of data.tables) for (const i of t.items) if (i.kind === "group") i.collapsed = true;
          s.data = data;
          s.panelOpen = vo.panelOpen;
          s.search = "";
          s.rev = 0;
          s.past = [];
          s.future = [];
          lastEditAt = 0;
          s.undoLimit = vo.undoLimit;
          s.loadSeq++;
          s.saveStatus = "saved";
          s.selection = null;
        }),
      setSaveStatus: (st) => set((s) => { s.saveStatus = st; }),
      setView: (v) => set((s) => { Object.assign(s.view, v); }),
      select: (sel) => set((s) => { s.selection = sel; }),
      selectTables: (ids) =>
        set((s) => {
          const valid = ids.filter((id, i) => ids.indexOf(id) === i && s.data.tables.some((t) => t.id === id));
          s.selection = valid.length === 0 ? null : valid.length === 1 ? { type: "table", id: valid[0] } : { type: "tables", ids: valid };
        }),
      toggleTableSelection: (id) =>
        set((s) => {
          const cur = selectedTableIds(s.selection);
          const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
          s.selection = next.length === 0 ? null : next.length === 1 ? { type: "table", id: next[0] } : { type: "tables", ids: next };
        }),
      selectAllTables: () =>
        set((s) => {
          const ids = s.data.tables.map((t) => t.id);
          s.selection = ids.length === 0 ? null : ids.length === 1 ? { type: "table", id: ids[0] } : { type: "tables", ids };
        }),
      setMeta: (m) => mutate((s) => { Object.assign(s.meta, m); }),
      replaceAll: (data, meta) =>
        mutate((s) => {
          s.data = data;
          if (meta) Object.assign(s.meta, Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)));
          s.selection = null;
        }),

      addTable: (x, y) => {
        const t = newTable({ x: snap(x), y: snap(y), name: "", color: "" });
        let id = t.id;
        mutate((s) => {
          let n = s.data.tables.length + 1;
          while (s.data.tables.some((o) => o.name === `table_${n}`)) n++;
          t.name = `table_${n}`;
          t.color = s.data.settings.defaultTableColor;
          s.data.tables.push(t);
          s.selection = { type: "table", id };
        });
        return id;
      },
      updateTable: (id, patch) => mutate((s) => { const t = table(s, id); if (t) Object.assign(t, patch); }),
      moveTable: (id, x, y) => mutate((s) => { const t = table(s, id); if (t) { t.x = snap(x); t.y = snap(y); } }),
      moveTables: (entries) =>
        mutate((s) => {
          for (const e of entries) { const t = table(s, e.id); if (t) { t.x = snap(e.x); t.y = snap(e.y); } }
        }),
      updateTables: (ids, patch) => mutate((s) => { for (const id of ids) { const t = table(s, id); if (t) Object.assign(t, patch); } }),
      setTablesGroup: (ids, groupId) => mutate((s) => { for (const id of ids) { const t = table(s, id); if (t) t.groupId = groupId; } }),
      deleteTables: (ids) =>
        mutate((s) => {
          const gone = new Set(ids);
          s.data.tables = s.data.tables.filter((t) => !gone.has(t.id));
          s.data.relationships = s.data.relationships.filter((r) => !gone.has(r.fromTableId) && !gone.has(r.toTableId));
          s.selection = null;
        }),
      deleteTable: (id) =>
        mutate((s) => {
          s.data.tables = s.data.tables.filter((t) => t.id !== id);
          s.data.relationships = s.data.relationships.filter((r) => r.fromTableId !== id && r.toTableId !== id);
          s.selection = null;
        }),

      addColumn: (tableId, groupId) => {
        const c = newColumn({ name: "column" });
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const all = t.items.flatMap((i) => (i.kind === "group" ? i.columns : [i]));
          let n = all.length + 1;
          while (all.some((o) => o.name === `column_${n}`)) n++;
          c.name = `column_${n}`;
          const g = groupId ? t.items.find((i): i is ColumnGroup => i.kind === "group" && i.id === groupId) : undefined;
          (g ? g.columns : t.items).push(c);
        });
        return c.id;
      },
      updateColumn: (tableId, colId, patch) =>
        mutate((s) => {
          const c = findColumn(table(s, tableId), colId);
          if (c) Object.assign(c, patch);
        }),
      deleteColumn: (tableId, colId) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          t.items = t.items.filter((i) => i.id !== colId);
          t.items.forEach((i) => { if (i.kind === "group") i.columns = i.columns.filter((c) => c.id !== colId); });
          pruneIndexes(t);
          pruneRelationships(s.data);
        }),
      addIndex: (tableId, init = {}) => {
        const ix = newIndex(init);
        mutate((s) => { table(s, tableId)?.indexes.push(ix); });
        return ix.id;
      },
      updateIndex: (tableId, indexId, patch) =>
        mutate((s) => {
          const t = table(s, tableId);
          const ix = t?.indexes.find((x) => x.id === indexId);
          if (!t || !ix) return;
          Object.assign(ix, patch);
          if (patch.columnIds) ix.columnIds = ix.columnIds.filter((id, i, a) => a.indexOf(id) === i && !!findColumn(t, id));
        }),
      deleteIndex: (tableId, indexId) =>
        mutate((s) => { const t = table(s, tableId); if (t) t.indexes = t.indexes.filter((x) => x.id !== indexId); }),
      setPrimaryKey: (tableId, columnIds) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const want = new Set(columnIds);
          for (const i of t.items) for (const c of i.kind === "group" ? i.columns : [i]) {
            const pk = want.has(c.id);
            c.primaryKey = pk;
            if (pk) c.notNull = true;
          }
        }),
      moveColumn: (tableId, colId, dir) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const container: { id: string }[] =
            t.items.some((i) => i.id === colId) ? t.items
              : (t.items.find((i) => i.kind === "group" && i.columns.some((c) => c.id === colId)) as ColumnGroup).columns;
          const idx = container.findIndex((c) => c.id === colId);
          const to = idx + dir;
          if (to < 0 || to >= container.length) return;
          [container[idx], container[to]] = [container[to], container[idx]];
        }),
      moveNode: (tableId, nodeId, containerId, beforeId) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t || beforeId === nodeId || containerId === nodeId) return;
          let node: TableItem | undefined = t.items.find((i) => i.id === nodeId);
          if (!node) {
            for (const g of t.items) {
              if (g.kind === "group") { node = g.columns.find((c) => c.id === nodeId); if (node) break; }
            }
          }
          if (!node || (node.kind === "group" && containerId)) return;
          const target = containerId ? t.items.find((i): i is ColumnGroup => i.kind === "group" && i.id === containerId) : undefined;
          if (containerId && !target) return;
          t.items = t.items.filter((i) => i.id !== nodeId);
          t.items.forEach((i) => { if (i.kind === "group") i.columns = i.columns.filter((c) => c.id !== nodeId); });
          const list: TableItem[] = target ? target.columns : t.items;
          const at = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
          list.splice(at < 0 ? list.length : at, 0, node);
        }),
      moveColumnToGroup: (tableId, colId, groupId) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const col = findColumn(t, colId);
          if (!col) return;
          const copy = { ...col };
          t.items = t.items.filter((i) => i.id !== colId);
          t.items.forEach((i) => { if (i.kind === "group") i.columns = i.columns.filter((c) => c.id !== colId); });
          const g = groupId ? t.items.find((i): i is ColumnGroup => i.kind === "group" && i.id === groupId) : undefined;
          (g ? g.columns : t.items).push(copy);
        }),

      addGroup: (tableId) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const n = t.items.filter((i) => i.kind === "group").length + 1;
          t.items.push(newGroup({ name: `group_${n}` }));
        }),
      updateGroup: (tableId, groupId, patch) => {
        const apply = (s: EditorState) => {
          const g = table(s, tableId)?.items.find((i) => i.id === groupId);
          if (g && g.kind === "group") Object.assign(g, patch);
        };
        // Collapsing is view state: not an edit, not saved.
        if (Object.keys(patch).every((k) => k === "collapsed")) transient(apply);
        else mutate(apply);
      },
      deleteGroup: (tableId, groupId) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const idx = t.items.findIndex((i) => i.id === groupId);
          const g = t.items[idx];
          if (!g || g.kind !== "group") return;
          t.items.splice(idx, 1, ...g.columns);
        }),
      moveItem: (tableId, itemId, dir) =>
        mutate((s) => {
          const t = table(s, tableId);
          if (!t) return;
          const idx = t.items.findIndex((i) => i.id === itemId);
          const to = idx + dir;
          if (idx < 0 || to < 0 || to >= t.items.length) return;
          [t.items[idx], t.items[to]] = [t.items[to], t.items[idx]];
        }),

      setForeignKey: (tableId, colId, target) =>
        mutate((s) => {
          s.data.relationships = s.data.relationships.filter(
            (r) => !(r.fromTableId === tableId && r.fromColumnId === colId),
          );
          if (target) {
            s.data.relationships.push(
              newRelationship({ fromTableId: tableId, fromColumnId: colId, toTableId: target.tableId, toColumnId: target.columnId }),
            );
          }
        }),
      updateRelationship: (id, patch) =>
        mutate((s) => { const r = s.data.relationships.find((x) => x.id === id); if (r) Object.assign(r, patch); }),
      deleteRelationship: (id) =>
        mutate((s) => {
          s.data.relationships = s.data.relationships.filter((r) => r.id !== id);
          s.selection = null;
        }),

      updateSettings: (patch) => {
        // View options are remembered per user (see EditorTemplate), not as an edit of this design.
        const view = pickViewSettings(patch);
        if (Object.keys(view).length) transient((s) => { Object.assign(s.data.settings, view); });
        const design = Object.fromEntries(Object.entries(patch).filter(([k]) => !(k in view)));
        if (Object.keys(design).length) mutate((s) => { Object.assign(s.data.settings, design); }, { localInViewing: true });
      },

      setAllColumnGroupsCollapsed: (collapsed) =>
        transient((s) => {
          for (const t of s.data.tables) for (const i of t.items) if (i.kind === "group") i.collapsed = collapsed;
        }),

      addTableGroup: (name, description = "") => {
        const g = newTableGroup({ name: name.trim() || "group", description });
        mutate((s) => { s.data.tableGroups.push(g); });
        return g.id;
      },
      updateTableGroup: (id, patch) =>
        mutate((s) => { const g = s.data.tableGroups.find((x) => x.id === id); if (g) Object.assign(g, patch); }),
      deleteTableGroup: (id) =>
        mutate((s) => {
          s.data.tableGroups = s.data.tableGroups.filter((g) => g.id !== id);
          for (const t of s.data.tables) if (t.groupId === id) t.groupId = null;
        }),
      setTableGroup: (tableId, groupId) =>
        mutate((s) => { const t = table(s, tableId); if (t) t.groupId = groupId; }),
    };
  }),
);

export { GRID };
