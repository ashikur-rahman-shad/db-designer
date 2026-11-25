import { DEFAULT_SETTINGS, newColumn, newGroup, newIndex, newRelationship, newTable, newTableGroup, snap } from "@/domain/factory";
import { allColumns } from "@/domain/model";
import { tableLayout } from "@/domain/layout";
import type { Column, ColumnGroup, DesignData, DesignMeta, RefAction, Relationship, TableGroup, TableModel } from "@/domain/types";
import { tokenize, type Tok } from "./tokenizer";

export interface ImportResult {
  meta: Partial<DesignMeta>;
  data: DesignData;
  warnings: string[];
}

const isKw = (t: Tok | undefined, ...kws: string[]) =>
  !!t && t.type === "word" && kws.includes(t.value.toUpperCase());
const isP = (t: Tok | undefined, p: string) => !!t && t.type === "punct" && t.value === p;
const isName = (t: Tok | undefined) => !!t && (t.type === "word" || t.type === "ident");

const COLUMN_STOP = new Set([
  "NOT", "NULL", "PRIMARY", "UNIQUE", "DEFAULT", "REFERENCES", "CHECK", "CONSTRAINT",
  "GENERATED", "AUTOINCREMENT", "AUTO_INCREMENT", "COLLATE", "COMMENT", "IDENTITY",
]);

interface PendingIndex {
  tableName: string;
  name: string;
  unique: boolean;
  columns: string[];
}

interface PendingFk {
  tableName: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: RefAction;
  onUpdate: RefAction;
  label: string;
}

/** Collects `@tag: value` directives, joining repeated lines with newlines. */
class Directives {
  private map = new Map<string, string[]>();
  add(tag: string, value: string) {
    const list = this.map.get(tag) ?? [];
    list.push(value);
    this.map.set(tag, list);
  }
  get(tag: string) { return this.map.get(tag)?.join("\n"); }
  has(tag: string) { return this.map.has(tag); }
  clear() { this.map.clear(); }
}

function parseDirective(text: string): { tag: string; value: string } | null {
  const m = /^@([\w.]+)\s*:?\s?(.*)$/.exec(text.trimStart());
  return m ? { tag: m[1].toLowerCase(), value: m[2].replace(/\s+$/, "") } : null;
}

/** Notes on a column's line are written with `\\n` / `\\\\` escapes (see export.ts). */
const unescapeNote = (text: string) => text.replace(/\\([n\\])/g, (_, c: string) => (c === "n" ? "\n" : "\\"));

/** The values of a `col IN ('a', 'b')` check body, or null if the tokens are anything else (i.e. a real CHECK expression). */
function enumFromCheck(t: Tok[], colName: string): string[] | null {
  if (t.length < 6 || !isName(t[0]) || t[0].value.toLowerCase() !== colName.toLowerCase()) return null;
  if (!isKw(t[1], "IN") || !isP(t[2], "(") || !isP(t[t.length - 1], ")")) return null;
  const values: string[] = [];
  for (let k = 3; k < t.length - 1; k++) {
    if ((k - 3) % 2 === 0) { if (t[k].type !== "string") return null; values.push(t[k].value); }
    else if (!isP(t[k], ",")) return null;
  }
  return values.length && (t.length - 4) % 2 === 1 ? values : null;
}

export function parseSql(sql: string): ImportResult {
  const toks = tokenize(sql);
  /** Is there a blank line between token k-1 and token k? (Blank lines end column groups and detach comments.) */
  const blankBefore = (k: number) => k > 0 && (sql.slice(toks[k - 1].end, toks[k].start).match(/\n/g)?.length ?? 0) >= 2;
  /** Does token b start on the line where token a ends? */
  const sameLine = (a: number, b: number) => !sql.slice(toks[a].end, toks[b].start).includes("\n");
  /** Older files name each table's group with `-- @table.group:`; newer ones put tables under their `-- @tablegroup` header. */
  const taggedGroups = toks.some((t) => t.type === "comment" && /^@table\.group\b/i.test(t.value.trim()));
  /** Is token k (a comment) in a comment block that is followed by a blank line? */
  const blockEndsBlank = (k: number) => {
    let e = k;
    while (toks[e + 1]?.type === "comment" && !blockBreak(e + 1)) e++;
    return e + 1 < toks.length && blankBefore(e + 1);
  };
  const blockBreak = (k: number) => blankBefore(k);
  const isSeparator = (v: string) => /^-{3,}$/.test(v.trim());
  /** Plain (non-`@`) comment lines directly above the statement starting at token `stmt`, with no blank line between. */
  const plainAbove = (stmt: number): string => {
    let k = stmt - 1;
    while (k >= 0 && toks[k].type === "comment" && !blankBefore(k + 1)) {
      if (k > 0 && toks[k - 1].type !== "comment" && sameLine(k - 1, k)) break; // trailing comment of the previous statement
      k--;
    }
    const lines = toks.slice(k + 1, stmt).filter((c) => !parseDirective(c.value) && !isSeparator(c.value)).map((c) => c.value.trimEnd());
    return lines.join("\n").trim();
  };
  const warnings: string[] = [];
  const meta: Partial<DesignMeta> = {};
  const metaLines: Record<string, string[]> = {};
  const tables: TableModel[] = [];
  const tableGroups: TableGroup[] = [];
  let curTableGroup: TableGroup | null = null;
  const ensureTableGroup = (name: string): TableGroup => {
    let g = tableGroups.find((x) => x.name === name) ?? tableGroups.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!g) { g = newTableGroup({ name }); tableGroups.push(g); }
    return g;
  };
  const fks: PendingFk[] = [];
  const indexes: PendingIndex[] = [];
  const tableComments: { table: string; column?: string; text: string }[] = [];

  let i = 0;
  const peek = (o = 0) => toks[i + o];

  /** Raw source text covered by tokens [from, to). */
  const raw = (from: number, to: number) => (to > from ? sql.slice(toks[from].start, toks[to - 1].end) : "");

  /** Index just past the balanced group starting at `open` (a "(" token). */
  const skipGroup = (open: number): number => {
    let depth = 0;
    for (let k = open; k < toks.length; k++) {
      if (isP(toks[k], "(")) depth++;
      else if (isP(toks[k], ")")) { depth--; if (depth === 0) return k + 1; }
    }
    return toks.length;
  };

  const skipStatement = () => {
    while (i < toks.length && !isP(peek(), ";")) {
      if (isP(peek(), "(")) i = skipGroup(i); else i++;
    }
    i++;
  };

  const readQualifiedName = (): string => {
    let name = isName(peek()) ? toks[i++].value : "";
    while (isP(peek(), ".") && isName(peek(1))) { i++; name = toks[i++].value; }
    return name;
  };

  const readNameList = (): string[] => {
    const out: string[] = [];
    if (!isP(peek(), "(")) return out;
    i++;
    while (i < toks.length && !isP(peek(), ")")) {
      if (isName(peek())) out.push(toks[i].value);
      i++;
    }
    i++;
    return out;
  };

  const readRefActions = (): { onDelete: RefAction; onUpdate: RefAction } => {
    const acts = { onDelete: "NO ACTION" as RefAction, onUpdate: "NO ACTION" as RefAction };
    while (isKw(peek(), "ON")) {
      const which = peek(1)?.value.toUpperCase();
      i += 2;
      let action = "";
      if (isKw(peek(), "NO")) { action = "NO ACTION"; i += 2; }
      else if (isKw(peek(), "SET")) { action = `SET ${peek(1)?.value.toUpperCase()}`; i += 2; }
      else if (isKw(peek(), "CASCADE", "RESTRICT")) { action = peek().value.toUpperCase(); i++; }
      else break;
      if (which === "DELETE") acts.onDelete = action as RefAction;
      else if (which === "UPDATE") acts.onUpdate = action as RefAction;
    }
    return acts;
  };

  /** Parse `REFERENCES t [(c)] [ON ...]` (cursor on REFERENCES). */
  const readReferences = (tableName: string, columns: string[], label: string) => {
    i++; // REFERENCES
    const refTable = readQualifiedName();
    const refColumns = readNameList();
    const acts = readRefActions();
    fks.push({ tableName, columns, refTable, refColumns, label, ...acts });
  };

  const parseCreateTable = (top: Directives) => {
    // cursor after TABLE
    if (isKw(peek(), "IF")) i += 3;
    const name = readQualifiedName();
    if (!isP(peek(), "(")) { warnings.push(`Skipped CREATE TABLE ${name}: no column list`); skipStatement(); return; }
    i++;

    const table = newTable({ name, items: [], description: top.get("table.description") ?? "" });
    const color = top.get("table.color");
    table.color = color && /^#[0-9a-f]{3,8}$/i.test(color.trim()) ? color.trim() : DEFAULT_SETTINGS.defaultTableColor;
    const groupName = top.get("table.group")?.trim();
    if (groupName) table.groupId = ensureTableGroup(groupName).id;
    else if (!taggedGroups && curTableGroup) table.groupId = curTableGroup.id; // under a `-- @tablegroup` header
    tables.push(table);

    let group: ColumnGroup | null = null;
    const pend = new Directives();
    const pkCols: string[] = [];
    const uniqueCols: string[] = [];

    const applyComment = (text: string, at: number) => {
      const d = parseDirective(text);
      if (!d) {
        // Plain comment lines right after the `CREATE TABLE … (` line, set off by a blank line, describe the table.
        if (!group && table.items.length === 0 && blockEndsBlank(at)) {
          if (text.trim() || table.description) table.description = table.description ? `${table.description}\n${text.trim()}` : text.trim();
          return;
        }
        // A plain comment line under a group header describes the group.
        const g = group as ColumnGroup | null;
        if (g && g.columns.length === 0 && (text.trim() || g.description)) g.description = g.description ? `${g.description}\n${text.trim()}` : text.trim();
        return;
      }
      switch (d.tag) {
        case "group": // `-- @group Name` or `-- @group Name (collapsed)`; `@group.begin: Name` is the older spelling
        case "group.begin": {
          const m = /^(.*?)\s*\(collapsed\)\s*$/i.exec(d.value);
          group = newGroup({ name: (m ? m[1] : d.value).trim() || "group", collapsed: !!m });
          table.items.push(group);
          pend.clear(); // clear any stale column tags
          break;
        }
        case "group.description":
          if (group) group.description = group.description ? `${group.description}\n${d.value}` : d.value;
          break;
        case "group.collapsed":
          if (group) group.collapsed = d.value.trim().toLowerCase() === "true";
          break;
        case "group.end":
          group = null;
          break;
        default:
          pend.add(d.tag, d.value);
      }
    };

    const walk = () => {
      // Walk elements separated by commas at depth 0 until the closing ")".
      let guard = 0;
      while (i < toks.length && guard++ < 100000) {
        // A blank line ends the current column group.
        while (peek()?.type === "comment") {
          if (group && blankBefore(i)) group = null;
          applyComment(toks[i].value, i);
          i++;
        }
        if (isP(peek(), ")")) { i++; break; }
        if (group && blankBefore(i)) group = null;

        const start = i;
        const after: number[] = [];
        let depth = 0;
        while (i < toks.length) {
          const t = toks[i];
          if (t.type === "comment") { after.push(i); i++; continue; }
          if (isP(t, "(")) depth++;
          else if (isP(t, ")")) { if (depth === 0) break; depth--; }
          else if (isP(t, ",") && depth === 0) break;
          i++;
        }
        const end = i;
        const col = parseElement(start, end);
        if (isP(peek(), ",")) i++;
        // A comment on the same line as the definition (before or after the comma) is the column's description.
        const notes: string[] = [];
        const take = (k: number) => {
          if (k > 0 && toks[k - 1].type !== "comment" && sameLine(k - 1, k)) notes.push(toks[k].value.trim());
          else {
            if (group && blankBefore(k)) group = null;
            applyComment(toks[k].value, k);
          }
        };
        after.forEach(take);
        while (peek()?.type === "comment" && toks[i - 1].type !== "comment" && sameLine(i - 1, i)) { take(i); i++; }
        const note = notes.filter(Boolean).join(" ");
        if (col && note) {
          const m = /^@logical\b\s*:?\s*(.*)$/i.exec(note);
          if (m) col.logicalErd = true;
          const text = m ? m[1] : note;
          if (text) col.description = unescapeNote(text);
        }
      }
      // Consume to end of statement.
      skipStatement();
    };

    function parseElement(from: number, to: number): Column | null {
      const els = toks.slice(from, to).filter((t) => t.type !== "comment");
      if (els.length === 0) return null;
      const sub = els;
      const p = new SubParser(sub);

      // `KEY` / `INDEX` start an inline index only when followed by `(cols)` or `name (cols)`; else it is a column name.
      const inlineIndex = isKw(sub[0], "KEY", "INDEX") && (isP(sub[1], "(") || isP(sub[2], "("));
      if (inlineIndex || isKw(sub[0], "CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "CHECK")) {
        p.tableConstraint();
        pend.clear();
        return null;
      }
      const col = p.column();
      pend.clear();
      return col;
    }

    class SubParser {
      k = 0;
      constructor(private t: Tok[]) {}
      cur(o = 0) { return this.t[this.k + o]; }
      rawSlice(a: number, b: number) { return b > a ? sql.slice(this.t[a].start, this.t[b - 1].end) : ""; }
      group(): [number, number] {
        const a = this.k;
        let depth = 0;
        for (let m = this.k; m < this.t.length; m++) {
          if (isP(this.t[m], "(")) depth++;
          else if (isP(this.t[m], ")")) { depth--; if (depth === 0) { this.k = m + 1; return [a + 1, m]; } }
        }
        this.k = this.t.length;
        return [a + 1, this.t.length];
      }
      names(): string[] {
        const [a, b] = this.group();
        return this.t.slice(a, b).filter(isName).map((x) => x.value);
      }
      refs(cols: string[]) {
        this.k++; // REFERENCES
        let refTable = "";
        if (isName(this.cur())) refTable = this.t[this.k++].value;
        while (isP(this.cur(), ".") && isName(this.cur(1))) { this.k++; refTable = this.t[this.k++].value; }
        const refColumns = isP(this.cur(), "(") ? this.names() : [];
        const acts = { onDelete: "NO ACTION" as RefAction, onUpdate: "NO ACTION" as RefAction };
        while (isKw(this.cur(), "ON")) {
          const which = this.cur(1)?.value.toUpperCase();
          this.k += 2;
          let a = "";
          if (isKw(this.cur(), "NO")) { a = "NO ACTION"; this.k += 2; }
          else if (isKw(this.cur(), "SET")) { a = `SET ${this.cur(1)?.value.toUpperCase()}`; this.k += 2; }
          else if (isKw(this.cur(), "CASCADE", "RESTRICT")) { a = this.cur().value.toUpperCase(); this.k++; }
          else break;
          if (which === "DELETE") acts.onDelete = a as RefAction;
          else if (which === "UPDATE") acts.onUpdate = a as RefAction;
        }
        fks.push({ tableName: name, columns: cols, refTable, refColumns, label: pend.get("rel.label") ?? "", ...acts });
      }
      /** `[KEY | INDEX] [name] (cols)` after UNIQUE / on its own (MySQL inline index syntax). */
      namedColumnList(): { name: string; columns: string[] } {
        if (isKw(this.cur(), "KEY", "INDEX")) this.k++;
        let idxName = "";
        if (isName(this.cur()) && !isP(this.cur(), "(")) idxName = this.t[this.k++].value;
        return { name: idxName, columns: this.names() };
      }
      tableConstraint() {
        let constraintName = "";
        if (isKw(this.cur(), "CONSTRAINT")) { constraintName = this.cur(1)?.value ?? ""; this.k += 2; }
        if (isKw(this.cur(), "PRIMARY")) { this.k += 2; pkCols.push(...this.names()); }
        else if (isKw(this.cur(), "UNIQUE")) {
          this.k++;
          const { name: idxName, columns: cols } = this.namedColumnList();
          if (cols.length === 1 && !idxName) uniqueCols.push(cols[0]);
          else if (cols.length) indexes.push({ tableName: name, name: constraintName || idxName, unique: true, columns: cols });
        } else if (isKw(this.cur(), "KEY", "INDEX")) {
          const { name: idxName, columns: cols } = this.namedColumnList();
          if (cols.length) indexes.push({ tableName: name, name: idxName, unique: false, columns: cols });
        } else if (isKw(this.cur(), "FOREIGN")) {
          this.k += 2;
          const cols = this.names();
          if (isKw(this.cur(), "REFERENCES")) this.refs(cols);
        }
        // CHECK table constraints are ignored.
      }
      column(): Column {
        const colName = this.t[this.k++].value;
        const col: Column = newColumn({
          name: colName, dataType: "", logicalErd: false, // not marked logical in the SQL = not logical
          description: pend.get("column.description") ?? "",
          enumValues: pend.get("column.enum")?.trim() ?? "",
        });
        if (pend.get("column.logical")?.trim().toLowerCase() === "true") col.logicalErd = true;

        const typeStart = this.k;
        while (this.k < this.t.length) {
          const tk = this.t[this.k];
          if (tk.type === "word" && COLUMN_STOP.has(tk.value.toUpperCase())) break;
          if (isP(tk, "(")) this.group(); else this.k++;
        }
        const typeToks = this.t.slice(typeStart, this.k);
        if (isKw(typeToks[0], "ENUM") && isP(typeToks[1], "(")) {
          // MySQL ENUM('a', 'b'): the values become the enum list, the type a VARCHAR long enough for them.
          const values = typeToks.filter((x) => x.type === "string").map((x) => x.value);
          col.enumValues = values.join(", ");
          col.dataType = `VARCHAR(${Math.max(10, ...values.map((v) => v.length))})`;
        } else col.dataType = this.rawSlice(typeStart, this.k).trim() || "VARCHAR(255)";

        while (this.k < this.t.length) {
          const tk = this.cur();
          if (isKw(tk, "CONSTRAINT")) { this.k += 2; continue; }
          if (isKw(tk, "NOT") && isKw(this.cur(1), "NULL")) { col.notNull = true; this.k += 2; continue; }
          if (isKw(tk, "NULL")) { this.k++; continue; }
          if (isKw(tk, "PRIMARY")) { col.primaryKey = true; this.k += 2; continue; }
          if (isKw(tk, "UNIQUE")) { col.unique = true; this.k++; continue; }
          if (isKw(tk, "AUTOINCREMENT", "AUTO_INCREMENT")) { col.autoIncrement = true; this.k++; continue; }
          if (isKw(tk, "GENERATED")) {
            this.k++;
            while (this.k < this.t.length && !isKw(this.cur(), "IDENTITY")) this.k++;
            this.k++;
            if (isP(this.cur(), "(")) this.group();
            col.autoIncrement = true;
            continue;
          }
          if (isKw(tk, "DEFAULT")) {
            this.k++;
            const a = this.k;
            if (isP(this.cur(), "-") || isP(this.cur(), "+")) this.k++;
            this.k++;
            if (isP(this.cur(), "(")) this.group();
            col.defaultValue = this.rawSlice(a, this.k);
            continue;
          }
          if (isKw(tk, "CHECK")) {
            this.k++;
            const [a, b] = this.group();
            const values = enumFromCheck(this.t.slice(a, b), colName);
            if (values) col.enumValues = values.join(", "); // CHECK (col IN ('a', 'b')) is an enum
            else col.check = this.rawSlice(a, b);
            continue;
          }
          if (isKw(tk, "REFERENCES")) { this.refs([colName]); continue; }
          if (isKw(tk, "COMMENT") && this.cur(1)?.type === "string") {
            if (!col.description) col.description = this.cur(1).value;
            this.k += 2;
            continue;
          }
          this.k++;
        }

        if (group) (group as ColumnGroup).columns.push(col);
        else table.items.push(col);
        return col;
      }
    }

    walk();

    // Apply table-level PK/UNIQUE after all columns are known.
    const cols = allColumns(table);
    const find = (n: string) => cols.find((c) => c.name.toLowerCase() === n.toLowerCase());
    pkCols.forEach((n) => { const c = find(n); if (c) { c.primaryKey = true; c.notNull = true; } });
    uniqueCols.forEach((n) => { const c = find(n); if (c) c.unique = true; });
  };

  /** `[UNIQUE] INDEX [IF NOT EXISTS] name ON table [USING m] (col [ASC|DESC], ...)` (cursor on INDEX). */
  const parseCreateIndex = (unique: boolean) => {
    i++; // INDEX
    if (isKw(peek(), "CONCURRENTLY")) i++;
    if (isKw(peek(), "IF")) i += 3;
    const name = isKw(peek(), "ON") ? "" : readQualifiedName();
    if (!isKw(peek(), "ON")) { skipStatement(); return; }
    i++;
    const tableName = readQualifiedName();
    if (isKw(peek(), "USING")) i += 2;
    const cols = readNameList().filter((n) => !["ASC", "DESC"].includes(n.toUpperCase()));
    if (cols.length) indexes.push({ tableName, name, unique, columns: cols });
    skipStatement();
  };

  const parseAlter = (top: Directives) => {
    // cursor after TABLE
    const tableName = readQualifiedName();
    while (i < toks.length && !isP(peek(), ";")) {
      if (isKw(peek(), "ADD")) {
        i++;
        if (isKw(peek(), "CONSTRAINT")) i += 2;
        if (isKw(peek(), "FOREIGN")) {
          i += 2;
          const cols = readNameList();
          if (isKw(peek(), "REFERENCES")) readReferences(tableName, cols, top.get("rel.label") ?? "");
          continue;
        }
      }
      if (isP(peek(), "(")) i = skipGroup(i); else i++;
    }
    i++;
  };

  const parseCommentOn = () => {
    // cursor after COMMENT ON
    const kind = peek()?.value.toUpperCase();
    i++;
    const a = readQualifiedName();
    let colName: string | undefined;
    let tableName = a;
    if (kind === "COLUMN") {
      // schema.table.column -> readQualifiedName keeps the last part; re-scan for table
      const stop = i;
      let j = stop - 1;
      const parts: string[] = [];
      while (j >= 0 && (isName(toks[j]) || isP(toks[j], "."))) { if (isName(toks[j])) parts.unshift(toks[j].value); j--; }
      colName = parts[parts.length - 1];
      tableName = parts[parts.length - 2] ?? "";
    }
    if (isKw(peek(), "IS") && peek(1)?.type === "string") {
      tableComments.push({ table: tableName, column: colName, text: peek(1).value });
    }
    skipStatement();
  };

  // ---- Top level ----
  let top = new Directives();
  let groupOpen = false; // plain comment lines right under `-- @tablegroup Name` describe that table group
  const describeGroup = (text: string) => {
    if (curTableGroup && (text || curTableGroup.description)) curTableGroup.description = curTableGroup.description ? `${curTableGroup.description}\n${text}` : text;
  };
  while (i < toks.length) {
    const t = peek();
    if (t.type === "comment") {
      const wasOpen = groupOpen && !blankBefore(i);
      groupOpen = false;
      if (isSeparator(t.value)) { curTableGroup = null; i++; continue; } // end of a table group: later tables have none
      const d = parseDirective(t.value);
      if (d && d.tag.startsWith("design.")) (metaLines[d.tag] ??= []).push(d.value);
      else if (d && d.tag === "tablegroup") { curTableGroup = ensureTableGroup(d.value.trim() || "group"); groupOpen = true; }
      else if (d && d.tag === "tablegroup.description") { describeGroup(d.value); groupOpen = true; }
      else if (d) top.add(d.tag, d.value);
      else if (wasOpen) { describeGroup(t.value.trim()); groupOpen = true; }
      i++;
      continue;
    }
    groupOpen = false;
    if (isP(t, ";")) { i++; continue; }
    // Plain comment lines right above a table / relationship are its description / annotation.
    const stmt = i;
    const attach = (tag: string) => {
      if (top.has(tag)) return;
      const plain = plainAbove(stmt);
      if (plain && !/^foreign keys$/i.test(plain)) top.add(tag, plain);
    };
    if (isKw(t, "CREATE")) attach("table.description");
    else if (isKw(t, "ALTER")) attach("rel.label");
    if (isKw(t, "CREATE")) {
      let j = i + 1;
      while (isKw(toks[j], "GLOBAL", "LOCAL", "TEMPORARY", "TEMP", "UNLOGGED")) j++;
      const uniqueIndex = isKw(toks[j], "UNIQUE");
      if (uniqueIndex) j++;
      if (isKw(toks[j], "TABLE") && !uniqueIndex) { i = j + 1; parseCreateTable(top); }
      else if (isKw(toks[j], "INDEX")) { i = j; parseCreateIndex(uniqueIndex); }
      else skipStatement();
    } else if (isKw(t, "ALTER") && isKw(peek(1), "TABLE")) {
      i += 2;
      if (isKw(peek(), "ONLY")) i++;
      parseAlter(top);
    } else if (isKw(t, "COMMENT") && isKw(peek(1), "ON")) {
      i += 2;
      parseCommentOn();
    } else {
      skipStatement();
    }
    top = new Directives();
  }

  if (metaLines["design.name"]) meta.name = metaLines["design.name"].join(" ");
  if (metaLines["design.short"]) meta.shortDescription = metaLines["design.short"].join("\n");
  if (metaLines["design.long"]) meta.longDescription = metaLines["design.long"].join("\n");

  // COMMENT ON fallback (only fills empty descriptions).
  const tByName = (n: string) => tables.find((t) => t.name.toLowerCase() === n.toLowerCase());
  for (const c of tableComments) {
    const t = tByName(c.table);
    if (!t) continue;
    if (!c.column) { if (!t.description) t.description = c.text; continue; }
    const col = allColumns(t).find((x) => x.name.toLowerCase() === c.column!.toLowerCase());
    if (col && !col.description) col.description = c.text;
  }

  // Resolve indexes (columns are matched by name; an index that names an unknown table / column is skipped).
  for (const ix of indexes) {
    const t = tByName(ix.tableName);
    const cols = t ? ix.columns.map((n) => allColumns(t).find((c) => c.name.toLowerCase() === n.toLowerCase())) : [];
    if (!t || cols.length === 0 || cols.some((c) => !c)) { warnings.push(`Index ${ix.name || ix.columns.join(", ")} on ${ix.tableName}: table or column not found, skipped`); continue; }
    t.indexes.push(newIndex({ name: ix.name, unique: ix.unique, columnIds: cols.map((c) => c!.id) }));
  }

  // Resolve foreign keys.
  const relationships: Relationship[] = [];
  for (const fk of fks) {
    const from = tByName(fk.tableName);
    const to = tByName(fk.refTable);
    if (!from || !to) { warnings.push(`Foreign key ${fk.tableName} -> ${fk.refTable}: table not found, skipped`); continue; }
    const refCols = fk.refColumns.length
      ? fk.refColumns
      : allColumns(to).filter((c) => c.primaryKey).map((c) => c.name);
    fk.columns.forEach((cn, idx) => {
      const fc = allColumns(from).find((c) => c.name.toLowerCase() === cn.toLowerCase());
      const tc = allColumns(to).find((c) => c.name.toLowerCase() === (refCols[idx] ?? "").toLowerCase());
      if (!fc || !tc) { warnings.push(`Foreign key ${fk.tableName}.${cn}: column not found, skipped`); return; }
      relationships.push(newRelationship({
        fromTableId: from.id, fromColumnId: fc.id, toTableId: to.id, toColumnId: tc.id,
        onDelete: fk.onDelete, onUpdate: fk.onUpdate, label: fk.label,
      }));
    });
  }

  const data: DesignData = { tableGroups, tables, relationships, settings: { ...DEFAULT_SETTINGS } };
  autoLayout(data);
  if (tables.length === 0) warnings.push("No CREATE TABLE statements were found.");
  return { meta, data, warnings };
}

/** Arrange tables in a grid of rows, positions snapped to the grid. */
export function autoLayout(data: DesignData): void {
  const cols = Math.max(1, Math.ceil(Math.sqrt(data.tables.length)));
  const gapX = 140, gapY = 80;
  let x = 40, y = 40, rowH = 0;
  data.tables.forEach((t, idx) => {
    const { width, height } = tableLayout(data, t);
    if (idx > 0 && idx % cols === 0) { x = 40; y += rowH + gapY; rowH = 0; }
    t.x = snap(x); t.y = snap(y);
    x += width + gapX;
    rowH = Math.max(rowH, height);
  });
}
