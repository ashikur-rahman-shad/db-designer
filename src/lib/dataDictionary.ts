import { allColumns, findColumn, indexName, primaryKeyColumns } from "@/domain/model";
import type { Column, DesignData, DesignMeta, TableModel } from "@/domain/types";
import { formatStamp, type DesignStamp } from "./designStamp";

/** One top-level Markdown block. Table blocks keep their lines so single rows can be copied. */
export interface MdBlock {
  md: string;
  table?: { head: string; sep: string; rows: string[] };
}

export interface DataDictionary {
  blocks: MdBlock[];
  /** The complete document. */
  markdown: string;
}

/** GitHub-style heading slug (used for the table-of-contents links). */
export const slug = (s: string) => s.trim().toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");

const code = (s: string) => {
  const t = s.replace(/\|/g, "\\|");
  return t.includes("`") ? `\`\` ${t} \`\`` : `\`${t}\``;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Escape characters that would turn plain names into Markdown formatting. */
const plain = (s: string) => s.replace(/[\\`*_[\]|]/g, "\\$&");
/** Escape free text for a table cell (pipes, line breaks). */
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

function tableBlock(head: string[], rows: string[][]): MdBlock {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const h = line(head);
  const sep = line(head.map(() => "---"));
  const r = rows.map(line);
  return { md: [h, sep, ...r].join("\n"), table: { head: h, sep, rows: r } };
}

function constraintsOf(c: Column, data: DesignData, tableId: string): string {
  const out: string[] = [];
  if (c.notNull && !c.primaryKey) out.push("NOT NULL");
  if (c.unique) out.push("UNIQUE");
  if (c.autoIncrement) out.push("IDENTITY");
  if (c.defaultValue.trim()) out.push(`DEFAULT ${code(c.defaultValue.trim())}`);
  if (c.check.trim()) out.push(`CHECK ${code(c.check.trim())}`);
  const en = c.enumValues.split(",").map((v) => v.trim()).filter(Boolean);
  if (en.length) out.push(`ENUM ${code(en.join(", "))}`);
  const rel = data.relationships.find((r) => r.fromTableId === tableId && r.fromColumnId === c.id);
  if (rel) {
    const to = data.tables.find((t) => t.id === rel.toTableId);
    const tc = findColumn(to, rel.toColumnId);
    if (to && tc) {
      const acts = [rel.onDelete !== "NO ACTION" ? `ON DELETE ${rel.onDelete}` : "", rel.onUpdate !== "NO ACTION" ? `ON UPDATE ${rel.onUpdate}` : ""].filter(Boolean);
      out.push(`REFERENCES ${code(`${to.name}.${tc.name}`)}${acts.length ? ` (${acts.join(", ")})` : ""}`);
    }
  }
  return out.join("<br>");
}

function columnsTable(cols: Column[], t: TableModel, data: DesignData): MdBlock {
  return tableBlock(
    ["Key", "Column", "Type", "Constraints", "Description"],
    cols.map((c) => {
      const fk = data.relationships.some((r) => r.fromTableId === t.id && r.fromColumnId === c.id);
      const key = [c.primaryKey ? "PK" : "", fk ? "FK" : ""].filter(Boolean).join(", ");
      return [key, code(c.name), code(c.dataType), constraintsOf(c, data, t.id), cell(c.description)];
    }),
  );
}

/** Heading text of a table section (its slug is the target of the overview links). */
const tableTitle = (t: TableModel) => `${t.name} table`;

/** The Markdown blocks of one table: heading, group, description, columns (per column group) and indexes. */
function tableBlocks(t: TableModel, data: DesignData): MdBlock[] {
  const blocks: MdBlock[] = [];
  const add = (md: string) => blocks.push({ md });
  add(`### ${tableTitle(t)}`);
  if (t.description.trim()) add(t.description.trim());
  const hasGroups = t.items.some((i) => i.kind === "group");
  if (allColumns(t).length === 0) { add("*No columns.*"); return blocks; }
  add(`**Columns:** ${allColumns(t).length}`);
  const pk = primaryKeyColumns(t);
  if (pk.length > 1) add(`**Composite primary key:** ${pk.map((c) => code(c.name)).join(", ")}`);

  // Consecutive ungrouped columns share one table; every group gets its own heading + table.
  let run: Column[] = [];
  const flush = () => {
    if (!run.length) return;
    if (hasGroups) add("#### Ungrouped columns");
    blocks.push(columnsTable(run, t, data));
    run = [];
  };
  for (const item of t.items) {
    if (item.kind === "column") { run.push(item); continue; }
    flush();
    add(`#### ${item.name} columns`);
    if (item.description.trim()) add(item.description.trim());
    if (item.columns.length) blocks.push(columnsTable(item.columns, t, data));
    else add("*No columns.*");
  }
  flush();

  if (t.indexes.length) {
    add("#### Indexes");
    const names = new Map(allColumns(t).map((c) => [c.id, c.name]));
    blocks.push(tableBlock(
      ["Index", "Columns", "Unique"],
      t.indexes.map((ix) => [code(indexName(t, ix)), ix.columnIds.map((id) => code(names.get(id) ?? "?")).join(", "), ix.unique ? "yes" : "no"]),
    ));
  }
  return blocks;
}

/** Markdown for a single table (what the data dictionary shows for it). */
export function buildTableMarkdown(data: DesignData, tableId: string): string {
  const t = data.tables.find((x) => x.id === tableId);
  return t ? tableBlocks(t, data).map((b) => b.md).join("\n\n") + "\n" : "";
}

/**
 * Builds the data dictionary Markdown for a design (always the full design, not the logical
 * view). Output is split in blocks so the preview can map a selection back to exact Markdown.
 */
export function buildDataDictionary(meta: DesignMeta, data: DesignData, _date = new Date(), stamp?: DesignStamp): DataDictionary {
  const blocks: MdBlock[] = [];
  const add = (md: string) => blocks.push({ md });
  const colCount = data.tables.reduce((n, t) => n + allColumns(t).length, 0);

  add(`# ${meta.name || "Untitled design"} — Data dictionary`);
  // The version and update time are on the line right under the title.
  if (stamp) {
    const version = stamp.version > 0 ? `**Version:** ${stamp.version}${stamp.modified ? " (edited since)" : ""}` : "**Version:** not saved yet";
    add(`${version} · **Updated:** ${formatStamp(stamp.updatedAt)}`);
  }
  if (meta.shortDescription.trim()) add(`> ${meta.shortDescription.trim().replace(/\r?\n/g, " ")}`);
  if (meta.longDescription.trim()) add(meta.longDescription.trim());
  // The summary line has an empty line before it (`<br>` keeps the space in the preview and in rendered Markdown).
  add("<br>");
  add(
    `*${data.tables.length} table${data.tables.length === 1 ? "" : "s"} · ${colCount} column${colCount === 1 ? "" : "s"} · ` +
      `${data.relationships.length} relationship${data.relationships.length === 1 ? "" : "s"}*`,
  );

  if (data.tables.length) {
    const tableRow = (t: TableModel) => [
      `[${t.name.replace(/[[\]|]/g, "\\$&")}](#${slug(tableTitle(t))})`,
      plural(allColumns(t).length, "column"),
      cell(t.description),
    ];
    const rows: string[][] = [];
    if (data.tableGroups.length) {
      // Each table group is a bold row (name, table count, description) followed by its tables.
      const known = new Set(data.tableGroups.map((g) => g.id));
      for (const g of data.tableGroups) {
        const ts = data.tables.filter((t) => t.groupId === g.id);
        rows.push([`**${plain(g.name)}**`, plural(ts.length, "table"), cell(g.description)]);
        rows.push(...ts.map(tableRow));
      }
      const rest = data.tables.filter((t) => !t.groupId || !known.has(t.groupId));
      if (rest.length) rows.push(["**Ungrouped**", plural(rest.length, "table"), ""], ...rest.map(tableRow));
    } else {
      rows.push(...data.tables.map(tableRow));
    }
    blocks.push(tableBlock([data.tableGroups.length ? "Name" : "Table", "Contains", "Description"], rows));

    // One h2 per table group (when there are groups), then its tables.
    if (data.tableGroups.length) {
      const known = new Set(data.tableGroups.map((g) => g.id));
      for (const g of data.tableGroups) {
        add(`## ${plain(g.name)} Tables`);
        if (g.description.trim()) add(g.description.trim());
        for (const t of data.tables) if (t.groupId === g.id) blocks.push(...tableBlocks(t, data));
      }
      const rest = data.tables.filter((t) => !t.groupId || !known.has(t.groupId));
      if (rest.length) {
        add("## Ungrouped Tables");
        for (const t of rest) blocks.push(...tableBlocks(t, data));
      }
    } else {
      for (const t of data.tables) blocks.push(...tableBlocks(t, data));
    }
  }

  if (data.relationships.length) {
    add("## Relationships");
    const name = (tid: string, cid: string) => {
      const t = data.tables.find((x) => x.id === tid);
      return code(`${t?.name ?? "?"}.${findColumn(t, cid)?.name ?? "?"}`);
    };
    blocks.push(
      tableBlock(
        ["From (FK)", "To (referenced)", "On delete", "On update", "Annotation"],
        data.relationships.map((r) => [name(r.fromTableId, r.fromColumnId), name(r.toTableId, r.toColumnId), r.onDelete, r.onUpdate, cell(r.label)]),
      ),
    );
  }

  return { blocks, markdown: blocks.map((b) => b.md).join("\n\n") + "\n" };
}
