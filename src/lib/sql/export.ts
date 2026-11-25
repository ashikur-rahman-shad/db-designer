import { allColumns, findColumn, indexName } from "@/domain/model";
import type { Column, DesignData, DesignMeta, TableGroup, TableModel } from "@/domain/types";

/** Marker line that identifies SQL written by this tool (see docs/SQL_COMMENT_PROTOCOL.md). */
export const PROTOCOL_VERSION = 1;

export type SqlDialect = "ansi" | "oracle" | "postgres" | "mysql";
export const SQL_DIALECTS: { value: SqlDialect; label: string }[] = [
  { value: "ansi", label: "ANSI SQL" },
  { value: "oracle", label: "Oracle" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
];

/**
 * What to include in the export. Except for `dialect`, `nativeComments`, indexes, foreign keys and enum values, everything
 * is "design" information that is not needed to create the schema: switch it off for a plain, comment-free script.
 */
export interface SqlExportOptions {
  dialect: SqlDialect;
  /** Design name and descriptions (header comments). */
  designInfo: boolean;
  tableDescriptions: boolean;
  columnDescriptions: boolean;
  /** Table colors. */
  colors: boolean;
  /** Column groups and table groups (as structured comments). */
  groups: boolean;
  /** Allowed values of enum columns, written as real SQL (MySQL `ENUM(...)`, otherwise `CHECK (col IN (...))`). */
  enumValues: boolean;
  /** The "logical view" flag of each column. */
  logicalFlags: boolean;
  /** Annotations on relationship lines. */
  relationshipLabels: boolean;
  /** Also write descriptions as real database comments (COMMENT ON / MySQL COMMENT). */
  nativeComments: boolean;
  /** CREATE INDEX statements, including composite / unique ones. */
  indexes: boolean;
  foreignKeys: boolean;
}

/** Everything switched on (the "all" button, and the base for programmatic exports). */
export const ALL_EXPORT_OPTIONS: SqlExportOptions = {
  dialect: "ansi",
  designInfo: true,
  tableDescriptions: true,
  columnDescriptions: true,
  colors: true,
  groups: true,
  enumValues: true,
  logicalFlags: true,
  relationshipLabels: true,
  nativeComments: false,
  indexes: true,
  foreignKeys: true,
};

/** What the export dialog starts with (and what its "default" button restores). */
export const DEFAULT_EXPORT_OPTIONS: SqlExportOptions = {
  ...ALL_EXPORT_OPTIONS,
  designInfo: false,
  colors: false,
  logicalFlags: false,
};

/** Options for a bare schema: no design information at all, no comments (enum values stay: they are real constraints). */
export const PLAIN_EXPORT_OPTIONS: Omit<SqlExportOptions, "dialect"> = {
  designInfo: false, tableDescriptions: false, columnDescriptions: false, colors: false, groups: false,
  enumValues: true, logicalFlags: false, relationshipLabels: false, nativeComments: false, indexes: true, foreignKeys: true,
};

const q = (d: SqlDialect, name: string) => (d === "mysql" ? `\`${name.replace(/`/g, "``")}\`` : `"${name.replace(/"/g, '""')}"`);
const lit = (text: string) => `'${text.replace(/'/g, "''")}'`;

/** Map a column type to the dialect's closest native type (unknown types are kept as they are). */
export function mapType(d: SqlDialect, dataType: string): string {
  const t = dataType.trim() || "VARCHAR(255)";
  if (d === "ansi") return t;
  const i = t.indexOf("(");
  const base = (i < 0 ? t : t.slice(0, i)).trim().toUpperCase().replace(/\s+/g, " ");
  const args = i < 0 ? "" : t.slice(i);
  const MAPS: Record<Exclude<SqlDialect, "ansi">, Record<string, string | ((a: string) => string)>> = {
    oracle: {
      VARCHAR: (a) => `VARCHAR2${a}`, TEXT: "CLOB", JSON: "CLOB", INTEGER: "NUMBER(10)", INT: "NUMBER(10)", SMALLINT: "NUMBER(5)",
      BIGINT: "NUMBER(19)", TINYINT: "NUMBER(3)", DECIMAL: (a) => `NUMBER${a}`, NUMERIC: (a) => `NUMBER${a}`, REAL: "BINARY_FLOAT",
      DOUBLE: "BINARY_DOUBLE", "DOUBLE PRECISION": "BINARY_DOUBLE", BOOLEAN: "NUMBER(1)", TIME: "TIMESTAMP", DATETIME: "TIMESTAMP",
      UUID: "RAW(16)", BYTEA: "BLOB",
    },
    postgres: {
      DATETIME: "TIMESTAMP", TINYINT: "SMALLINT", DOUBLE: "DOUBLE PRECISION", BLOB: "BYTEA", VARCHAR2: (a) => `VARCHAR${a}`,
      NUMBER: (a) => `NUMERIC${a}`, CLOB: "TEXT",
    },
    mysql: {
      "DOUBLE PRECISION": "DOUBLE", "TIMESTAMP WITH TIME ZONE": "TIMESTAMP", UUID: "CHAR(36)", VARCHAR2: (a) => `VARCHAR${a}`,
      NUMBER: (a) => `DECIMAL${a}`, CLOB: "LONGTEXT", BYTEA: "BLOB",
    },
  };
  const m = MAPS[d][base];
  if (m === undefined) return t;
  return typeof m === "function" ? m(args) : args && !m.includes("(") ? m + args : m;
}

/** Emit one `-- @tag: value` line per line of text (empty text emits nothing). */
function tagLines(tag: string, text: string | undefined, indent = ""): string[] {
  if (!text || !text.trim()) return [];
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => `${indent}-- @${tag}: ${l}`.trimEnd());
}

/** One line of text for a trailing `-- note`: newlines and backslashes are escaped so the note stays on its line. */
const escapeNote = (text: string) => text.trim().replace(/\\/g, "\\\\").replace(/\r\n?|\n/g, "\\n");

/** Plain `-- text` comment lines (an empty line stays a comment so it cannot end a block). */
function plainLines(text: string | undefined, indent = ""): string[] {
  if (!text || !text.trim()) return [];
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => `${indent}-- ${l}`.trimEnd());
}

/** The allowed values of an enum column. */
const enumList = (c: Column) => c.enumValues.split(",").map((v) => v.trim()).filter(Boolean);

/** A line of a table body: `head` comment lines, the SQL `text` (empty for an empty group) and a trailing `note`. */
interface Row {
  /** Rows of one block (a run of ungrouped columns, or one column group) are separated from other blocks by a blank line. */
  block: number;
  head: string[];
  text: string;
  note: string;
}

function columnDef(c: Column, o: SqlExportOptions): string {
  const d = o.dialect;
  const values = o.enumValues ? enumList(c) : [];
  // MySQL has a real ENUM type; other databases get the portable equivalent, a CHECK ... IN (...) constraint.
  const type = d === "mysql" && values.length ? `ENUM(${values.map(lit).join(", ")})` : mapType(d, c.dataType);
  // An identity / auto-increment column cannot also have a default in Oracle, PostgreSQL and MySQL.
  const def = c.defaultValue.trim() && !(c.autoIncrement && d !== "ansi") ? `DEFAULT ${c.defaultValue.trim()}` : "";
  const identity = d === "mysql" ? "AUTO_INCREMENT" : "GENERATED BY DEFAULT AS IDENTITY";
  const parts = [q(d, c.name), type];
  if (d === "oracle") {
    // Oracle wants DEFAULT right after the type; an identity column cannot have a default.
    if (def) parts.push(def);
    if (c.autoIncrement) parts.push(identity);
    if (c.notNull) parts.push("NOT NULL");
  } else if (d === "mysql") {
    if (c.notNull) parts.push("NOT NULL");
    if (def) parts.push(def);
    if (c.autoIncrement) parts.push(identity);
  } else {
    if (c.autoIncrement) parts.push(identity);
    if (c.notNull) parts.push("NOT NULL");
    if (def) parts.push(def);
  }
  if (c.unique) parts.push("UNIQUE");
  if (values.length && d !== "mysql") parts.push(`CHECK (${q(d, c.name)} IN (${values.map(lit).join(", ")}))`);
  if (c.check.trim()) parts.push(`CHECK (${c.check.trim()})`);
  if (d === "mysql" && o.nativeComments && o.columnDescriptions && c.description.trim()) parts.push(`COMMENT ${lit(c.description.trim())}`);
  return parts.join(" ");
}

function columnRow(c: Column, singlePk: boolean, o: SqlExportOptions, block: number): Row {
  let text = columnDef(c, o);
  if (singlePk && c.primaryKey) text += " PRIMARY KEY";
  // The description is a plain trailing comment on the column's own line; `@logical` marks a logical-view column.
  const note = [o.logicalFlags && c.logicalErd ? "@logical" : "", o.columnDescriptions ? escapeNote(c.description) : ""].filter(Boolean).join(" ");
  return { block, head: [], text: "  " + text, note };
}

/** Trailing notes are aligned in a column, except behind very long definitions. */
const NOTE_ALIGN_MAX = 90;

/** Closes a table group: the tables that follow no longer belong to it (see docs/SQL_COMMENT_PROTOCOL.md). */
export const TABLE_GROUP_SEPARATOR = "-- --------------------";

function tableSql(t: TableModel, o: SqlExportOptions): string {
  const d = o.dialect;
  const cols = allColumns(t);
  const pks = cols.filter((c) => c.primaryKey);
  const singlePk = pks.length === 1;
  const rows: Row[] = [];
  let block = -1;
  let open = false; // is the current block a run of ungrouped columns?
  const ungrouped = (c: Column) => {
    if (!open) { block++; open = true; }
    rows.push(columnRow(c, singlePk, o, block));
  };

  for (const item of t.items) {
    if (item.kind === "column") { ungrouped(item); continue; }
    if (!o.groups) { item.columns.forEach(ungrouped); continue; }
    block++;
    open = false;
    const head = [
      `  -- @group ${item.name}`,
      ...plainLines(item.description, "  "),
    ];
    if (item.columns.length === 0) rows.push({ block, head, text: "", note: "" });
    item.columns.forEach((c, i) => {
      const r = columnRow(c, singlePk, o, block);
      if (i === 0) r.head = head;
      rows.push(r);
    });
  }
  // Composite primary key: one table constraint over all key columns, in column order.
  if (pks.length > 1) {
    if (!open) { block++; open = true; }
    rows.push({ block, head: [], text: `  CONSTRAINT ${q(d, `pk_${t.name}`)} PRIMARY KEY (${pks.map((c) => q(d, c.name)).join(", ")})`, note: "" });
  }

  const lastReal = [...rows].reverse().find((r) => r.text);
  const sqlOf = (r: Row) => r.text + (r === lastReal ? "" : ",");
  const align = Math.max(0, ...rows.filter((r) => r.note && sqlOf(r).length <= NOTE_ALIGN_MAX).map((r) => sqlOf(r).length));
  const lines: string[] = [];
  rows.forEach((r, i) => {
    if (i === 0 || rows[i - 1].block !== r.block) lines.push(""); // blank line after the table line and between blocks
    lines.push(...r.head);
    if (!r.text) return;
    const sql = sqlOf(r);
    lines.push(r.note ? `${sql.length <= NOTE_ALIGN_MAX ? sql.padEnd(align) : sql} -- ${r.note}` : sql);
  });

  const mysqlTableComment = d === "mysql" && o.nativeComments && o.tableDescriptions && t.description.trim() ? ` COMMENT=${lit(t.description.trim())}` : "";
  return [
    ...(o.colors && t.color ? [`-- @table.color: ${t.color}`] : []),
    `CREATE TABLE ${q(d, t.name)} (`,
    ...(o.tableDescriptions ? plainLines(t.description, "  ") : []), // the description follows the table line
    ...lines,
    `)${mysqlTableComment};`,
  ].join("\n");
}

function indexSql(t: TableModel, o: SqlExportOptions): string[] {
  const d = o.dialect;
  const byId = new Map(allColumns(t).map((c) => [c.id, c.name]));
  return t.indexes.flatMap((ix) => {
    const cols = ix.columnIds.flatMap((id) => (byId.has(id) ? [q(d, byId.get(id)!)] : []));
    if (cols.length === 0) return [];
    return [`CREATE ${ix.unique ? "UNIQUE " : ""}INDEX ${q(d, indexName(t, ix))} ON ${q(d, t.name)} (${cols.join(", ")});`];
  });
}

function nativeCommentSql(t: TableModel, o: SqlExportOptions): string[] {
  if (!o.nativeComments || o.dialect === "mysql") return [];
  const d = o.dialect;
  const out: string[] = [];
  if (o.tableDescriptions && t.description.trim()) out.push(`COMMENT ON TABLE ${q(d, t.name)} IS ${lit(t.description.trim())};`);
  if (o.columnDescriptions) {
    for (const c of allColumns(t)) {
      if (c.description.trim()) out.push(`COMMENT ON COLUMN ${q(d, t.name)}.${q(d, c.name)} IS ${lit(c.description.trim())};`);
    }
  }
  return out;
}

/**
 * Serialise a design as SQL for the chosen dialect (default: ANSI with everything included; the export dialog starts from `DEFAULT_EXPORT_OPTIONS`). Design information that
 * SQL cannot express (descriptions, colors, groups, ...) is written as structured `-- @tag:` comments that this
 * tool can read back (docs/SQL_COMMENT_PROTOCOL.md); each kind can be switched off in `options`.
 */
export function exportSql(
  meta: DesignMeta,
  data: DesignData,
  options: Partial<SqlExportOptions> = {},
  extra: {
    /** Written as `-- @design.version` / `-- @design.updated` right after the marker line. */
    stamp?: { version: number; updatedAt: string };
    /** Export just this table: its indexes and its own foreign keys (the ones it holds). */
    onlyTableId?: string;
  } = {},
): string {
  const o: SqlExportOptions = { ...ALL_EXPORT_OPTIONS, ...options };
  const d = o.dialect;
  const hasProtocol = o.designInfo || o.tableDescriptions || o.columnDescriptions || o.colors || o.groups || o.logicalFlags || o.relationshipLabels;
  // The file is a list of blocks separated by two empty lines.
  const blocks: string[][] = [];
  const top: string[] = [];
  if (hasProtocol) {
    top.push(`-- @dbdesigner: ${PROTOCOL_VERSION}`);
    if (extra.stamp) top.push(`-- @design.version: ${extra.stamp.version}`, `-- @design.updated: ${extra.stamp.updatedAt}`);
  }
  if (o.designInfo) {
    top.push(`-- @design.name: ${meta.name}`);
    top.push(...tagLines("design.short", meta.shortDescription));
    top.push(...tagLines("design.long", meta.longDescription));
  }
  if (top.length) blocks.push(top);

  const everyTable = data.tables;
  const only = extra.onlyTableId ? data.tables.find((t) => t.id === extra.onlyTableId) : undefined;
  if (only) data = { ...data, tables: [only], tableGroups: [], relationships: data.relationships.filter((r) => r.fromTableId === only.id) };
  const tableBlock = (t: TableModel) => [tableSql(t, o), ...(o.indexes ? indexSql(t, o) : []), ...nativeCommentSql(t, o)].join("\n").split("\n");
  if (o.groups && data.tableGroups.length) {
    // Each table group is a header (`-- @tablegroup Name` + description) followed by its tables, then a separator line.
    // Tables belong to the group above them; tables without a group come last, after the final separator.
    for (const g of data.tableGroups) {
      blocks.push([`-- @tablegroup ${g.name}`, ...plainLines(g.description)]);
      for (const t of data.tables) if (t.groupId === g.id) blocks.push(tableBlock(t));
      blocks.push([TABLE_GROUP_SEPARATOR]);
    }
    const known = new Set(data.tableGroups.map((g) => g.id));
    for (const t of data.tables) if (!t.groupId || !known.has(t.groupId)) blocks.push(tableBlock(t));
  } else {
    for (const t of data.tables) blocks.push(tableBlock(t));
  }

  const byId = new Map(everyTable.map((t) => [t.id, t])); // a foreign key may point at a table that is not exported
  const fkSql: string[] = [];
  if (o.foreignKeys) {
    for (const r of data.relationships) {
      const from = byId.get(r.fromTableId), to = byId.get(r.toTableId);
      const fc = findColumn(from, r.fromColumnId), tc = findColumn(to, r.toColumnId);
      if (!from || !to || !fc || !tc) continue;
      // Oracle has no ON UPDATE, and only CASCADE / SET NULL for ON DELETE.
      const onDelete = r.onDelete !== "NO ACTION" && (d !== "oracle" || r.onDelete === "CASCADE" || r.onDelete === "SET NULL");
      const onUpdate = r.onUpdate !== "NO ACTION" && d !== "oracle";
      fkSql.push(
        [
          ...(o.relationshipLabels ? plainLines(r.label) : []),
          `ALTER TABLE ${q(d, from.name)} ADD CONSTRAINT ${q(d, `fk_${from.name}_${fc.name}`)} ` +
            `FOREIGN KEY (${q(d, fc.name)}) REFERENCES ${q(d, to.name)} (${q(d, tc.name)})` +
            (onDelete ? ` ON DELETE ${r.onDelete}` : "") +
            (onUpdate ? ` ON UPDATE ${r.onUpdate}` : "") +
            ";",
        ].join("\n"),
        "", // blank line after each relationship
      );
    }
  }
  if (fkSql.length) blocks.push([...(hasProtocol ? ["-- Foreign keys", ""] : []), ...fkSql.slice(0, -1)]); // no blank line after the last one
  else while (blocks.length && blocks[blocks.length - 1][0] === TABLE_GROUP_SEPARATOR) blocks.pop();
  return blocks.map((b) => b.join("\n")).join("\n\n\n") + "\n";
}
