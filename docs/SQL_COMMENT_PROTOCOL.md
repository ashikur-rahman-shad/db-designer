# SQL comment protocol (v1)

> The richer JSON format (layout, line details, full field reference, editing rules for AI) is documented in [`JSON_PROTOCOL.md`](JSON_PROTOCOL.md).

The exported SQL is plain SQL for the chosen database (ANSI, Oracle, PostgreSQL or MySQL). Design information lives in
**ordinary `--` comments**, so any SQL engine ignores them, while this tool reads them back on import. Most of it needs no
tag at all: *where* a comment is written says what it describes.

| Comment | Where | Meaning |
|---|---|---|
| `-- text` | **on the same line as a column** (after the comma) | Column description |
| `-- @logical` or `-- @logical text` | on a column's line | The column is a **logical** column (shown in the logical view), optionally followed by its description. **Opt-in:** a column without it is *not* logical |
| `-- text` lines | **right after the `CREATE TABLE … (` line**, followed by a blank line | Table description (several lines = several lines of text) |
| `-- @table.color: #rrggbb` | directly above `CREATE TABLE` | Header color |
| `-- @group <name>` (or `--@group <name>`) | inside `CREATE TABLE`, before the group's first column | Starts a **column group** (the collapsed state is a view setting and is not written to SQL) |
| `-- text` lines | directly under `-- @group` | Group description |
| `-- text` lines | **directly above** an `ALTER TABLE … FOREIGN KEY` | Annotation (label) on the relationship line |
| `-- @tablegroup <name>` | before the group's tables | Starts a **table group**; the tables written below it belong to it |
| `-- text` lines | directly under `-- @tablegroup` | Description of that table group |
| `-- --------------------` | after a group's last table | Ends the table group; tables after it belong to no group (or to the next `@tablegroup`) |
| `-- @dbdesigner: 1` | first line | Marker + protocol version |
| `-- @design.version: <n>` | line 2 | Saved version of the design this file was exported from (`0` = no version saved yet; for an old version, that version) |
| `-- @design.updated: <ISO time>` | line 3 | When the design was last updated (UTC, e.g. `2026-11-12T09:30:00.000Z`); for an old version, when it was saved |
| `-- @design.name` / `@design.short` / `@design.long` | file header | Design name, short and long description (repeat the tag for more lines) |

- **A column group ends at the first blank line** (or at the closing `)`); there is no `@group.end`. Columns written after a
  blank line are ungrouped.
- **Spacing.** One blank line is written after the table's description (or after the `CREATE TABLE … (` line), between column
  groups, and after every relationship. **Two empty lines** separate tables, table groups and the other top-level blocks. The
  importer does not need any of them except the blank line that ends a column group (and the one that closes a table description).
- **Table groups by position.** Each group is written as its header, then its tables (kept together), then two empty lines,
  the separator line and two more empty lines. Tables without a group come last, after the final separator. No
  `@table.group` tag is written; the importer reads membership from the position.
- A multi-line column description is kept on its line with `\n` as the line break (a literal backslash is written `\\`).
- Unknown tags and other comments are ignored. Plain comments anywhere else (not on a column's line, not directly above a
  table / foreign key / under a group header) are ignored too.
- Empty values are omitted.

**Two different "groups":** `@group` is a *column group* inside one table; `@tablegroup` is a *table group* that clusters whole
tables (shown as sections in the data dictionary overview). A table group with no tables is kept: its header is written
followed directly by the separator.

## Enum values are real SQL
Enum values are not comments. Not every database has an `ENUM` type, so the exporter uses what the database offers:

| Database | Output |
|---|---|
| MySQL | `` `status` ENUM('new', 'paid') `` (the column's data type is replaced by the enum) |
| ANSI, Oracle, PostgreSQL | `"status" VARCHAR(10) CHECK ("status" IN ('new', 'paid'))` |

(PostgreSQL also has `CREATE TYPE … AS ENUM`; a `CHECK` is used instead because it keeps the declared column type and needs no
extra statement.) On import, a column `CHECK (col IN ('a', 'b'))` or a MySQL `ENUM('a', 'b')` type becomes the column's enum
values (an `ENUM` column gets a `VARCHAR(n)` type); any other `CHECK` stays a check expression.

**Keys and indexes** use plain SQL: several `primaryKey` columns become one `CONSTRAINT "pk_<table>" PRIMARY KEY (a, b)`; each
index is `CREATE [UNIQUE] INDEX name ON table (a, b);` after its table. Import also reads composite `UNIQUE (a, b)` constraints
and MySQL `KEY` / `UNIQUE KEY name (…)` as indexes.

**Dialects and options.** Every kind of design comment can be switched off (see *Export SQL* in `REQUIREMENTS.md`); with all of
them off no `--` line is written at all. The dialog starts with indexes, foreign keys, enum values, table & column descriptions,
column / table groups and relationship annotations on; design name, table colors and logical flags are off (buttons **default**,
**all**, **none**).

Column order in the SQL is the display order. Primary key, `NOT NULL`, `UNIQUE`, `DEFAULT`, `CHECK`, identity
(`GENERATED BY DEFAULT AS IDENTITY`) and foreign keys (with `ON DELETE` / `ON UPDATE`) use standard syntax.

## Example
```sql
-- @dbdesigner: 1
-- @design.version: 3
-- @design.updated: 2026-11-12T09:30:00.000Z
-- @design.name: Shop
-- @design.short: Demo shop


-- @tablegroup Core
-- Tables every other module depends on


-- @table.color: #ef4444
CREATE TABLE "users" (
  -- Customers

  "id" INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL PRIMARY KEY, -- Primary key

  -- @group Contact
  -- How to reach them
  "email" VARCHAR(255) NOT NULL UNIQUE,                               -- @logical Login email
  "phone" VARCHAR(30),

  "status" VARCHAR(10) CHECK ("status" IN ('new', 'active')),         -- Account state
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- --------------------


CREATE TABLE "audit_log" (

  "id" INTEGER PRIMARY KEY,
  "user_id" INTEGER
);


-- Foreign keys

-- audited
ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_log_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
```

## Exporting one table
The table view can export a single table: its `CREATE TABLE`, its indexes and the `ALTER TABLE … FOREIGN KEY` lines of the foreign
keys it holds (not the ones of other tables that reference it). The format is identical, but without table groups.

## Older format
Files written by earlier versions still import: `-- @table.group: <name>` on each table (when any table has it, membership is read
from the tags only), `-- @group.collapsed: true` / `(collapsed)`, plain comments above `CREATE TABLE` as its description, `-- @table.description:`, `-- @column.description:`, `-- @column.enum: a, b`,
`-- @column.logical: true`, `-- @rel.label:`, `-- @tablegroup: <name>` / `-- @tablegroup.description:`, and
`-- @group.begin: <name>` … `-- @group.description:` / `-- @group.collapsed: true` / `-- @group.end`.

## Logical columns
`@logical` is the only way a column becomes logical; plain SQL imports with every column *not* logical. In the logical view,
columns with a **mandatory property** (default: primary key and foreign key; configurable under Settings) are shown regardless.

## Import fallbacks
- `COMMENT ON TABLE/COLUMN … IS '…'` fills descriptions that have no comment.
- MySQL-style `COMMENT '…'` on a column fills an empty description (a comment on the column's line wins).
- Any `-- comment` at the end of a column's line is taken as its description, so hand-written SQL imports naturally.
- Table positions are not in SQL; imported tables are auto-laid out. Use JSON to keep positions.

Implementation: `src/lib/sql/export.ts`, `src/lib/sql/import.ts`, `src/lib/sql/tokenizer.ts`. Round-trip test: `src/lib/sql/sql.test.ts`.
