import { describe, expect, it } from "vitest";
import { newColumn, newGroup, newRelationship, newTable, DEFAULT_SETTINGS } from "@/domain/factory";
import type { DesignData } from "@/domain/types";
import { PLAIN_EXPORT_OPTIONS, exportSql } from "./export";
import { parseSql } from "./import";

function sample(): DesignData {
  const id = newColumn({ name: "id", dataType: "INTEGER", primaryKey: true, notNull: true, autoIncrement: true, description: "Primary key\nsecond line" });
  const email = newColumn({ name: "email", dataType: "VARCHAR(255)", notNull: true, unique: true, description: "Login email" });
  const created = newColumn({ name: "created_at", dataType: "TIMESTAMP", defaultValue: "CURRENT_TIMESTAMP", logicalErd: false });
  const users = newTable({
    name: "users", description: "App users", color: "#ef4444",
    items: [id, newGroup({ name: "Contact", description: "How to reach", collapsed: true, columns: [email] }), newGroup({ name: "Empty" }), created],
  });
  const uid = newColumn({ name: "user_id", dataType: "INTEGER", notNull: true });
  const oid = newColumn({ name: "id", dataType: "INTEGER", primaryKey: true });
  const orders = newTable({ name: "orders", items: [oid, uid] });
  return {
    tableGroups: [],
    tables: [users, orders],
    relationships: [newRelationship({ fromTableId: orders.id, fromColumnId: uid.id, toTableId: users.id, toColumnId: id.id, onDelete: "CASCADE", label: "places" })],
    settings: { ...DEFAULT_SETTINGS },
  };
}

describe("sql round trip", () => {
  it("preserves groups, descriptions, flags, relationships and design meta", () => {
    const data = sample();
    const sql = exportSql({ name: "Shop", shortDescription: "short", longDescription: "long 1\nlong 2" }, data);
    expect(sql.startsWith("-- @dbdesigner: 1")).toBe(true);
    const r = parseSql(sql);
    expect(r.warnings).toEqual([]);
    expect(r.meta).toEqual({ name: "Shop", shortDescription: "short", longDescription: "long 1\nlong 2" });
    const users = r.data.tables[0];
    expect(users.description).toBe("App users");
    expect(users.color).toBe("#ef4444");
    expect(users.items.map((i) => i.kind)).toEqual(["column", "group", "group", "column"]);
    const id = users.items[0] as ReturnType<typeof newColumn>;
    expect(id).toMatchObject({ name: "id", primaryKey: true, notNull: true, autoIncrement: true, description: "Primary key\nsecond line" });
    const g = users.items[1] as ReturnType<typeof newGroup>;
    expect(g).toMatchObject({ name: "Contact", description: "How to reach", collapsed: false }); // collapsed state is not written to SQL
    expect(g.columns[0]).toMatchObject({ name: "email", unique: true, notNull: true, description: "Login email" });
    expect((users.items[2] as ReturnType<typeof newGroup>).columns).toHaveLength(0);
    expect(users.items[3]).toMatchObject({ name: "created_at", logicalErd: false, defaultValue: "CURRENT_TIMESTAMP" });
    expect(r.data.relationships).toHaveLength(1);
    expect(r.data.relationships[0]).toMatchObject({ onDelete: "CASCADE", label: "places" });
    // second export is stable
    expect(exportSql({ name: "Shop", shortDescription: "short", longDescription: "long 1\nlong 2" }, r.data)).toBe(sql);
  });

  it("imports plain SQL without tags", () => {
    const r = parseSql(`
      CREATE TABLE a (id INT PRIMARY KEY, name VARCHAR(10) NOT NULL DEFAULT 'x');
      CREATE TABLE b (id INT, a_id INT REFERENCES a(id) ON DELETE SET NULL, PRIMARY KEY (id));
      ALTER TABLE b ADD CONSTRAINT fk FOREIGN KEY (id) REFERENCES a (id);
      COMMENT ON TABLE a IS 'the a table';
    `);
    expect(r.data.tables).toHaveLength(2);
    expect(r.data.relationships).toHaveLength(2);
    expect(r.data.relationships[0].onDelete).toBe("SET NULL");
    expect(r.data.tables[0].description).toBe("the a table");
  });
});

describe("table groups", () => {
  it("round trips through SQL (definitions in the header, reference by name)", () => {
    const d = sample();
    d.tableGroups = [
      { id: "g1", name: "Core", description: "Core tables\nsecond line" },
      { id: "g2", name: "Unused", description: "" },
    ];
    d.tables[0].groupId = "g1";
    const meta = { name: "Shop", shortDescription: "", longDescription: "" };
    const sql = exportSql(meta, d);
    // header, then the group's tables, then a separator; tables without a group come last
    expect(sql).toContain("-- @tablegroup Core\n-- Core tables\n-- second line\n\n\n-- @table.color: #ef4444\nCREATE TABLE \"users\" (\n  -- App users\n\n");
    expect(sql).toMatch(/;\n\n\n-- -{20}\n\n\n-- @tablegroup Unused\n\n\n-- -{20}\n\n\n(-- @table.color: #\w+\n)?CREATE TABLE "orders"/);
    expect(sql).not.toContain("@table.group");
    const r = parseSql(sql);
    expect(r.warnings).toEqual([]);
    expect(r.data.tableGroups.map((g) => [g.name, g.description])).toEqual([["Core", "Core tables\nsecond line"], ["Unused", ""]]);
    expect(r.data.tables[0].groupId).toBe(r.data.tableGroups[0].id);
    expect(r.data.tables[1].groupId).toBeNull();
    expect(exportSql(meta, r.data)).toBe(sql);
  });

  it("creates a group on the fly when a table references an undeclared one", () => {
    const r = parseSql(`-- @table.group: Billing\nCREATE TABLE a (id INT);`);
    expect(r.data.tableGroups).toHaveLength(1);
    expect(r.data.tableGroups[0].name).toBe("Billing");
    expect(r.data.tables[0].groupId).toBe(r.data.tableGroups[0].id);
  });
});

describe("logical flag in SQL", () => {
  it("is opt-in: untagged columns import as NOT logical; `@column.logical: true` marks one", () => {
    const r = parseSql(`
      CREATE TABLE a (
        id INT PRIMARY KEY,
        -- @column.logical: true
        name VARCHAR(10),
        note TEXT
      );`);
    const cols = r.data.tables[0].items as ReturnType<typeof newColumn>[];
    expect(cols.map((c) => [c.name, c.logicalErd])).toEqual([["id", false], ["name", true], ["note", false]]);
  });

  it("exports `@column.logical: true` only for logical columns, and round trips", () => {
    const t = newTable({ items: [newColumn({ name: "a", logicalErd: true }), newColumn({ name: "b", logicalErd: false })] });
    const meta = { name: "x", shortDescription: "", longDescription: "" };
    const sql = exportSql(meta, { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } });
    expect(sql).toMatch(/"a" [^\n]*-- @logical\n/);
    expect(sql).not.toMatch(/"b" [^\n]*--/);
    const back = parseSql(sql).data.tables[0].items as ReturnType<typeof newColumn>[];
    expect(back.map((c) => c.logicalErd)).toEqual([true, false]);
  });
});

describe("indexes and composite keys", () => {
  function design() {
    const a = newColumn({ name: "order_id", dataType: "INTEGER", primaryKey: true, notNull: true });
    const b = newColumn({ name: "line_no", dataType: "INTEGER", primaryKey: true, notNull: true });
    const sku = newColumn({ name: "sku", dataType: "VARCHAR(40)", description: "Stock keeping unit" });
    const note = newColumn({ name: "note", dataType: "TEXT" });
    const t = newTable({
      name: "order_lines", description: "Lines of an order", color: "#ef4444", items: [a, b, sku, note],
      indexes: [
        { id: "ix1", name: "", columnIds: [a.id, sku.id], unique: true },
        { id: "ix2", name: "idx_note", columnIds: [note.id], unique: false },
      ],
    });
    return { data: { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } } as DesignData, t };
  }
  const meta = { name: "D", shortDescription: "", longDescription: "" };

  it("exports a composite primary key and (unique) indexes, and reads them back", () => {
    const sql = exportSql(meta, design().data);
    expect(sql).toContain('CONSTRAINT "pk_order_lines" PRIMARY KEY ("order_id", "line_no")');
    expect(sql).toContain('CREATE UNIQUE INDEX "uq_order_lines_order_id_sku" ON "order_lines" ("order_id", "sku");');
    expect(sql).toContain('CREATE INDEX "idx_note" ON "order_lines" ("note");');
    const r = parseSql(sql);
    expect(r.warnings).toEqual([]);
    const t = r.data.tables[0];
    expect(t.items.filter((i) => i.kind === "column" && i.primaryKey)).toHaveLength(2);
    expect(t.indexes.map((x) => [x.name, x.unique, x.columnIds.length])).toEqual([["uq_order_lines_order_id_sku", true, 2], ["idx_note", false, 1]]);
    expect(exportSql(meta, r.data)).toBe(sql);
  });

  it("imports composite UNIQUE constraints and MySQL inline keys as indexes", () => {
    const r = parseSql("CREATE TABLE t (a INT, b INT, key INT, CONSTRAINT u_ab UNIQUE (a, b), KEY k_b (b), UNIQUE KEY uk (b, a));");
    expect(r.warnings).toEqual([]);
    const t = r.data.tables[0];
    expect(t.items.map((i) => i.kind === "column" && i.name)).toEqual(["a", "b", "key"]);
    expect(t.indexes.map((x) => [x.name, x.unique, x.columnIds.length])).toEqual([["u_ab", true, 2], ["k_b", false, 1], ["uk", true, 2]]);
  });

  it("dialects use their own quoting, identity syntax and types", () => {
    const d = design().data;
    d.tables[0].items.push(newColumn({ name: "id2", dataType: "INTEGER", autoIncrement: true, defaultValue: "1" }));
    expect(exportSql(meta, d, { dialect: "mysql" })).toMatch(/`id2` INTEGER AUTO_INCREMENT/);
    const ora = exportSql(meta, d, { dialect: "oracle" });
    expect(ora).toContain('"sku" VARCHAR2(40)');
    expect(ora).toContain('"note" CLOB');
    expect(ora).toContain('"id2" NUMBER(10) GENERATED BY DEFAULT AS IDENTITY');
    expect(exportSql(meta, d, { dialect: "postgres" })).toContain('"id2" INTEGER GENERATED BY DEFAULT AS IDENTITY,');
  });

  it("with all design options off the script has no comments and no designer tags", () => {
    const d = design().data;
    const sql = exportSql(meta, d, { ...PLAIN_EXPORT_OPTIONS });
    expect(sql).not.toMatch(/--/);
    expect(sql).not.toContain("Stock keeping unit");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("CREATE UNIQUE INDEX");
  });

  it("descriptions can be exported as native comments", () => {
    const d = design().data;
    const pg = exportSql(meta, d, { dialect: "postgres", nativeComments: true });
    expect(pg).toContain(`COMMENT ON TABLE "order_lines" IS 'Lines of an order';`);
    expect(pg).toContain(`COMMENT ON COLUMN "order_lines"."sku" IS 'Stock keeping unit';`);
    const my = exportSql(meta, d, { dialect: "mysql", nativeComments: true, ...{ designInfo: false } });
    expect(my).toContain("COMMENT 'Stock keeping unit'");
    expect(my).toContain("COMMENT='Lines of an order'");
    // colors off => no color tag, descriptions off => no description at all
    const bare = exportSql(meta, d, { colors: false, tableDescriptions: false, columnDescriptions: false });
    expect(bare).not.toContain("@table.color");
    expect(bare).not.toContain("Lines of an order");
  });
});

describe("readable layout", () => {
  const meta = { name: "Shop", shortDescription: "", longDescription: "" };

  it("keeps descriptions on the column line, and separates the table line, groups and relationships with blank lines", () => {
    const sql = exportSql(meta, sample(), { logicalFlags: false });
    expect(sql).toContain('CREATE TABLE "users" (\n  -- App users\n\n  "id" INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL PRIMARY KEY, -- Primary key\\nsecond line\n\n  -- @group Contact\n  -- How to reach\n');
    expect(sql).toMatch(/"email" VARCHAR\(255\) NOT NULL UNIQUE, +-- Login email,?\n\n/);
    expect(sql).toContain("-- Foreign keys\n\n-- places\nALTER TABLE");
    expect(sql).not.toMatch(/@group\.|@column\.|@rel\./);
    expect(sql.endsWith(";\n")).toBe(true);
  });

  it("reads a plain trailing comment as the column description and ends a group at the blank line", () => {
    const r = parseSql(`CREATE TABLE a (
  id INT PRIMARY KEY, -- the key

  --@group Contact
  email VARCHAR(10), -- login address @logical
  phone VARCHAR(10),

  created TIMESTAMP -- when
);`);
    const items = r.data.tables[0].items;
    expect(items.map((i) => i.kind)).toEqual(["column", "group", "column"]);
    const g = items[1] as ReturnType<typeof newGroup>;
    expect(g.name).toBe("Contact");
    expect(g.columns.map((c) => c.name)).toEqual(["email", "phone"]);
    expect((items[0] as ReturnType<typeof newColumn>).description).toBe("the key");
    expect((items[2] as ReturnType<typeof newColumn>).description).toBe("when");
  });

  it("reads plain comments above a table / relationship as description / annotation", () => {
    const r = parseSql(`-- Customers\n-- of the shop\nCREATE TABLE u (id INT PRIMARY KEY);\nCREATE TABLE o (id INT, uid INT);\n\n-- Foreign keys\n\n-- places\nALTER TABLE o ADD CONSTRAINT fk FOREIGN KEY (uid) REFERENCES u (id);\n`);
    expect(r.data.tables[0].description).toBe("Customers\nof the shop");
    expect(r.data.tables[1].description).toBe("");
    expect(r.data.relationships[0].label).toBe("places");
  });

  it("still reads the older @tag format", () => {
    const r = parseSql(`-- @table.description: Old\nCREATE TABLE a (\n  -- @group.begin: G\n  -- @group.description: d\n  -- @column.description: c\n  -- @column.logical: true\n  x INT,\n  -- @group.end\n  y INT\n);`);
    const [g, y] = r.data.tables[0].items as [ReturnType<typeof newGroup>, ReturnType<typeof newColumn>];
    expect(r.data.tables[0].description).toBe("Old");
    expect(g).toMatchObject({ name: "G", description: "d" });
    expect(g.columns[0]).toMatchObject({ description: "c", logicalErd: true });
    expect(y.name).toBe("y");
  });
});

describe("enum values are real SQL", () => {
  const meta = { name: "E", shortDescription: "", longDescription: "" };
  const mk = () => {
    const t = newTable({ name: "t", items: [newColumn({ name: "flag", dataType: "VARCHAR(1)", enumValues: "Y, N", description: "Is it" })] });
    return { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } } as DesignData;
  };

  it("uses a CHECK ... IN constraint (ANSI, Oracle, PostgreSQL) and ENUM (MySQL)", () => {
    expect(exportSql(meta, mk(), { logicalFlags: false })).toContain(`"flag" VARCHAR(1) CHECK ("flag" IN ('Y', 'N')) -- Is it`);
    expect(exportSql(meta, mk(), { dialect: "oracle" })).toContain(`"flag" VARCHAR2(1) CHECK ("flag" IN ('Y', 'N'))`);
    expect(exportSql(meta, mk(), { dialect: "mysql" })).toContain("`flag` ENUM('Y', 'N')");
    expect(exportSql(meta, mk(), { enumValues: false })).not.toContain("'Y'");
    expect(exportSql(meta, mk(), { ...PLAIN_EXPORT_OPTIONS })).toContain(`CHECK ("flag" IN ('Y', 'N'))`);
  });

  it("reads them back as enum values, not as a check or comment", () => {
    for (const dialect of ["ansi", "mysql"] as const) {
      const c = parseSql(exportSql(meta, mk(), { dialect })).data.tables[0].items[0] as ReturnType<typeof newColumn>;
      expect(c).toMatchObject({ enumValues: "Y, N", check: "", description: "Is it" });
    }
    const c = parseSql(`CREATE TABLE t (n INT CHECK (n > 0), s VARCHAR(5) CHECK (s IN ('a','b')));`).data.tables[0].items as ReturnType<typeof newColumn>[];
    expect(c[0]).toMatchObject({ check: "n > 0", enumValues: "" });
    expect(c[1]).toMatchObject({ check: "", enumValues: "a, b" });
  });
});

describe("table groups by position", () => {
  const meta = { name: "G", shortDescription: "", longDescription: "" };
  it("keeps a group's tables together, groupless tables last, and reads membership from the position", () => {
    const d: DesignData = { tableGroups: [{ id: "a", name: "A", description: "first" }, { id: "b", name: "B", description: "" }], tables: [], relationships: [], settings: { ...DEFAULT_SETTINGS } };
    const mk = (name: string, groupId: string | null) => newTable({ name, groupId, description: `the ${name}`, items: [newColumn({ name: "id", dataType: "INT" })] });
    d.tables = [mk("t1", "b"), mk("t2", null), mk("t3", "a"), mk("t4", "b")];
    const opts = { colors: false, logicalFlags: false };
    const sql = exportSql(meta, d, opts);
    expect(sql.match(/CREATE TABLE "(\w+)"/g)).toEqual(['CREATE TABLE "t3"', 'CREATE TABLE "t1"', 'CREATE TABLE "t4"', 'CREATE TABLE "t2"']);
    expect(sql).toContain('CREATE TABLE "t3" (\n  -- the t3\n');
    const r = parseSql(sql);
    expect(r.warnings).toEqual([]);
    const g = (n: string) => r.data.tableGroups.find((x) => x.id === r.data.tables.find((t) => t.name === n)!.groupId)?.name ?? null;
    expect(["t1", "t2", "t3", "t4"].map(g)).toEqual(["B", null, "A", "B"]);
    expect(r.data.tables.find((t) => t.name === "t1")!.description).toBe("the t1");
    expect(exportSql(meta, r.data, opts)).toBe(sql);
  });

  it("does not take a comment above the first column as the table description unless a blank line follows it", () => {
    const r = parseSql("CREATE TABLE a (\n  -- the key\n  id INT,\n  x INT\n);\nCREATE TABLE b (\n  -- about b\n\n  id INT\n);");
    expect(r.data.tables.map((t) => t.description)).toEqual(["", "about b"]);
  });
});

describe("version stamp and single-table export", () => {
  const meta = { name: "S", shortDescription: "", longDescription: "" };
  it("writes the design version and update time right after the marker line", () => {
    const sql = exportSql(meta, sample(), {}, { stamp: { version: 3, updatedAt: "2026-11-12T09:30:00.000Z" } });
    expect(sql.startsWith("-- @dbdesigner: 1\n-- @design.version: 3\n-- @design.updated: 2026-11-12T09:30:00.000Z\n")).toBe(true);
    expect(parseSql(sql).warnings).toEqual([]);
    expect(exportSql(meta, sample())).not.toContain("@design.version");
  });

  it("exports one table with its indexes and the foreign keys it holds", () => {
    const d = sample();
    const orders = d.tables[1], users = d.tables[0];
    const sqlOrders = exportSql(meta, d, {}, { onlyTableId: orders.id });
    expect(sqlOrders).toContain('CREATE TABLE "orders"');
    expect(sqlOrders).not.toContain('CREATE TABLE "users"');
    expect(sqlOrders).toContain('ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id")');
    const sqlUsers = exportSql(meta, d, {}, { onlyTableId: users.id });
    expect(sqlUsers).toContain('CREATE TABLE "users"');
    expect(sqlUsers).not.toContain("ALTER TABLE"); // users holds no foreign key
  });
});
