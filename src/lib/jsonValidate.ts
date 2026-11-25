import { allColumns, findColumn, isUniqueColumn } from "@/domain/model";
import type { DesignData } from "@/domain/types";

/**
 * Consistency check for a design (e.g. one edited by hand or by an AI). The importer is forgiving and does NOT
 * reject these problems; they silently make parts of the design disappear (a relationship with a missing column is
 * never drawn and never exported). Returns human-readable problems, prefixed `error:` or `warning:`; empty = clean.
 * The rules are documented in docs/JSON_PROTOCOL.md.
 */
export function validateDesignData(data: DesignData): string[] {
  const out: string[] = [];
  const err = (m: string) => out.push(`error: ${m}`);
  const warn = (m: string) => out.push(`warning: ${m}`);

  const seen = new Map<string, string>();
  const unique = (id: string, what: string) => {
    if (!id) return err(`${what} has an empty id`);
    if (seen.has(id)) err(`duplicate id "${id}" (${seen.get(id)} and ${what})`);
    else seen.set(id, what);
  };

  data.tableGroups.forEach((g) => { unique(g.id, `table group "${g.name}"`); if (!g.name.trim()) err(`table group ${g.id} has no name`); });
  const groupNames = new Set<string>();
  for (const g of data.tableGroups) {
    const k = g.name.trim().toLowerCase();
    if (groupNames.has(k)) warn(`two table groups are named "${g.name}" (SQL refers to groups by name, so they would merge)`);
    groupNames.add(k);
  }

  const tableNames = new Set<string>();
  for (const t of data.tables) {
    unique(t.id, `table "${t.name}"`);
    if (!t.name.trim()) err(`table ${t.id} has no name`);
    const tn = t.name.trim().toLowerCase();
    if (tableNames.has(tn)) warn(`two tables are named "${t.name}"`);
    tableNames.add(tn);
    if (t.groupId && !data.tableGroups.some((g) => g.id === t.groupId)) err(`table "${t.name}" has groupId "${t.groupId}" which does not exist`);

    const colNames = new Set<string>();
    const cols = allColumns(t);
    if (cols.length === 0) warn(`table "${t.name}" has no columns`);
    const colIds = new Set(cols.map((c) => c.id));
    for (const ix of t.indexes ?? []) {
      unique(ix.id, `index "${ix.name}" of "${t.name}"`);
      if (ix.columnIds.length === 0) err(`index ${ix.id} of "${t.name}" has no columns, so it is dropped on import`);
      for (const id of ix.columnIds) if (!colIds.has(id)) err(`index ${ix.id} of "${t.name}" refers to column "${id}" which is not in that table`);
      if (new Set(ix.columnIds).size !== ix.columnIds.length) warn(`index ${ix.id} of "${t.name}" lists a column more than once`);
    }
    for (const it of t.items) if (it.kind === "group") unique(it.id, `column group "${it.name}" of "${t.name}"`);
    for (const c of cols) {
      unique(c.id, `column "${t.name}.${c.name}"`);
      if (!c.name.trim()) err(`a column of "${t.name}" has no name`);
      const cn = c.name.trim().toLowerCase();
      if (colNames.has(cn)) warn(`table "${t.name}" has two columns named "${c.name}"`);
      colNames.add(cn);
      if (c.primaryKey && !c.notNull) warn(`primary key "${t.name}.${c.name}" should also be notNull`);
    }
  }

  const fkColumns = new Set<string>();
  for (const r of data.relationships) {
    unique(r.id, "a relationship");
    const from = data.tables.find((t) => t.id === r.fromTableId);
    const to = data.tables.find((t) => t.id === r.toTableId);
    const fc = findColumn(from, r.fromColumnId);
    const tc = findColumn(to, r.toColumnId);
    if (!from || !fc) { err(`relationship ${r.id}: the foreign-key side (${r.fromTableId} / ${r.fromColumnId}) does not exist, so it is never drawn or exported`); continue; }
    if (!to || !tc) { err(`relationship ${r.id}: the referenced side (${r.toTableId} / ${r.toColumnId}) does not exist, so it is never drawn or exported`); continue; }
    if (!tc.primaryKey && !isUniqueColumn(to, tc)) warn(`relationship ${r.id}: ${to.name}.${tc.name} is referenced but is neither primaryKey nor unique`);
    if (fkColumns.has(r.fromColumnId)) warn(`column ${from.name}.${fc.name} is the foreign key of more than one relationship`);
    fkColumns.add(r.fromColumnId);
  }
  return out;
}
