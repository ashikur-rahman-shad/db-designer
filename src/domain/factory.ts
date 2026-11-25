import type { Column, ColumnGroup, DesignData, DesignSettings, Relationship, TableGroup, TableIndex, TableModel } from "./types";

export const GRID = 10;
export const snap = (v: number, g = GRID) => Math.round(v / g) * g;

export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const DEFAULT_SETTINGS: DesignSettings = {
  logicalMandatory: ["pk", "fk"],
  viewMode: "full",
  cornerRadius: 10,
  lineWidth: 1.5,
  lineColor: "#64748b",
  stubLength: 20,
  showGrid: true,
  showMarkers: true,
  showLabels: true,
  labelDirection: "parent-to-child",
  showAttributes: true,
  showDescriptions: true,
  hideGroups: false,
  defaultTableColor: "#3b82f6",
};

export const TABLE_COLORS = [
  "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#f59e0b",
  "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#64748b",
];

export function newColumn(partial: Partial<Column> = {}): Column {
  return {
    kind: "column",
    id: uid("col"),
    name: "column",
    dataType: "VARCHAR(255)",
    primaryKey: false,
    notNull: false,
    unique: false,
    autoIncrement: false,
    defaultValue: "",
    check: "",
    description: "",
    enumValues: "",
    logicalErd: true,
    ...partial,
  };
}

export function newGroup(partial: Partial<ColumnGroup> = {}): ColumnGroup {
  return { kind: "group", id: uid("grp"), name: "group", description: "", collapsed: false, columns: [], ...partial };
}

export function newTableGroup(partial: Partial<TableGroup> = {}): TableGroup {
  return { id: uid("tg"), name: "group", description: "", ...partial };
}

export function newIndex(partial: Partial<TableIndex> = {}): TableIndex {
  return { id: uid("idx"), name: "", columnIds: [], unique: false, ...partial };
}

export function newTable(partial: Partial<TableModel> = {}): TableModel {
  return {
    id: uid("tbl"),
    name: "new_table",
    description: "",
    color: DEFAULT_SETTINGS.defaultTableColor,
    groupId: null,
    x: 0,
    y: 0,
    width: 240,
    autoWidth: true,
    items: [newColumn({ name: "id", dataType: "INTEGER", primaryKey: true, notNull: true, autoIncrement: true })],
    indexes: [],
    ...partial,
  };
}

export function newRelationship(partial: Partial<Relationship> & Pick<Relationship, "fromTableId" | "fromColumnId" | "toTableId" | "toColumnId">): Relationship {
  return { id: uid("rel"), onDelete: "NO ACTION", onUpdate: "NO ACTION", label: "", bend: 0, labelPos: null, ...partial };
}

export function emptyDesignData(): DesignData {
  return { tableGroups: [], tables: [], relationships: [], settings: { ...DEFAULT_SETTINGS } };
}

/** Normalise unknown JSON into a complete DesignData (fills defaults, snaps to grid). */
export function normalizeDesignData(raw: Partial<DesignData> | undefined): DesignData {
  const settings = { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) };
  const validProps: string[] = ["pk", "fk", "nn", "uq", "ai"];
  if (settings.labelDirection !== "parent-to-child" && settings.labelDirection !== "child-to-parent") settings.labelDirection = DEFAULT_SETTINGS.labelDirection;
  settings.logicalMandatory = Array.isArray(settings.logicalMandatory)
    ? settings.logicalMandatory.filter((p, i, a) => validProps.includes(p) && a.indexOf(p) === i)
    : [...DEFAULT_SETTINGS.logicalMandatory];
  const tableGroups = (raw?.tableGroups ?? []).map((g) => ({ ...newTableGroup(), ...g }));
  const groupIds = new Set(tableGroups.map((g) => g.id));
  const tables = (raw?.tables ?? []).map((t) => ({
    ...newTable(),
    ...t,
    indexes: [] as TableIndex[],
    groupId: t.groupId && groupIds.has(t.groupId) ? t.groupId : null,
    x: snap(t.x ?? 0),
    y: snap(t.y ?? 0),
    width: Math.max(160, snap(t.width ?? 240)),
    items: (t.items ?? []).map((it) =>
      it.kind === "group"
        ? { ...newGroup(), ...it, columns: (it.columns ?? []).map((c) => ({ ...newColumn(), ...c, kind: "column" as const })) }
        : { ...newColumn(), ...it, kind: "column" as const },
    ),
  }));
  // Indexes: keep only well-formed ones, with columns that exist in their table (no duplicates, never empty).
  const rawIndexes = new Map((raw?.tables ?? []).map((t) => [t.id, t.indexes]));
  for (const t of tables) {
    const colIds = new Set(t.items.flatMap((it) => (it.kind === "group" ? it.columns : [it]).map((c) => c.id)));
    const list = rawIndexes.get(t.id);
    if (!Array.isArray(list)) continue;
    for (const ix of list) {
      if (!ix || typeof ix !== "object" || !Array.isArray(ix.columnIds)) continue;
      const columnIds = ix.columnIds.filter((id, i, a) => typeof id === "string" && colIds.has(id) && a.indexOf(id) === i);
      if (columnIds.length === 0) continue;
      t.indexes.push({ ...newIndex(), ...ix, name: typeof ix.name === "string" ? ix.name : "", unique: ix.unique === true, columnIds });
    }
  }
  const relationships = (raw?.relationships ?? []).map((r) => {
    const rel = { ...newRelationship(r), ...r };
    const lp = rel.labelPos as { from?: unknown; distance?: unknown } | null | undefined;
    rel.labelPos =
      lp && (lp.from === "start" || lp.from === "end") && typeof lp.distance === "number" && Number.isFinite(lp.distance)
        ? { from: lp.from, distance: Math.max(0, lp.distance) }
        : null;
    return rel;
  });
  return { tableGroups, tables, relationships, settings };
}
