import type { Column, DesignData, Relationship, TableIndex, TableModel } from "./types";

export function allColumns(table: TableModel): Column[] {
  return table.items.flatMap((it) => (it.kind === "group" ? it.columns : [it]));
}

export function findColumn(table: TableModel | undefined, columnId: string): Column | undefined {
  return table ? allColumns(table).find((c) => c.id === columnId) : undefined;
}

/** Primary-key columns of a table in display order. More than one = a composite primary key. */
export function primaryKeyColumns(table: TableModel): Column[] {
  return allColumns(table).filter((c) => c.primaryKey);
}

/** Drop deleted columns from the table's indexes; an index left without columns is removed. */
export function pruneIndexes(table: TableModel): void {
  const ids = new Set(allColumns(table).map((c) => c.id));
  for (const ix of table.indexes) ix.columnIds = ix.columnIds.filter((id) => ids.has(id));
  table.indexes = table.indexes.filter((ix) => ix.columnIds.length > 0);
}

/** True when the column alone is unique: its UQ flag is set or it is the only column of a unique index. */
export function isUniqueColumn(table: TableModel, c: Column): boolean {
  return c.unique || (table.indexes ?? []).some((ix) => ix.unique && ix.columnIds.length === 1 && ix.columnIds[0] === c.id);
}

/** Name used for an index in SQL: its own name or a generated one. */
export function indexName(table: TableModel, ix: TableIndex): string {
  if (ix.name.trim()) return ix.name.trim();
  const byId = new Map(allColumns(table).map((c) => [c.id, c.name]));
  return `${ix.unique ? "uq" : "idx"}_${table.name}_${ix.columnIds.map((id) => byId.get(id) ?? "col").join("_")}`;
}

export function isForeignKey(data: DesignData, tableId: string, columnId: string): boolean {
  return data.relationships.some((r) => r.fromTableId === tableId && r.fromColumnId === columnId);
}

export function relationshipFor(data: DesignData, tableId: string, columnId: string): Relationship | undefined {
  return data.relationships.find((r) => r.fromTableId === tableId && r.fromColumnId === columnId);
}

/** Drop relationships whose tables/columns no longer exist. */
export function pruneRelationships(data: DesignData): void {
  const byId = new Map(data.tables.map((t) => [t.id, t]));
  data.relationships = data.relationships.filter(
    (r) => findColumn(byId.get(r.fromTableId), r.fromColumnId) && findColumn(byId.get(r.toTableId), r.toColumnId),
  );
}
