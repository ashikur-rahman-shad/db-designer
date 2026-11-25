import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newGroup, newIndex, newRelationship, newTable, newTableGroup } from "@/domain/factory";
import type { DesignData } from "@/domain/types";
import { buildDataDictionary, buildTableMarkdown, slug } from "./dataDictionary";

const meta = { name: "Shop", shortDescription: "Demo shop", longDescription: "Long text" };

function design(): DesignData {
  const id = newColumn({ name: "id", dataType: "INT", primaryKey: true, notNull: true, autoIncrement: true, description: "Key | pipe" });
  const email = newColumn({ name: "email", dataType: "VARCHAR(255)", unique: true, defaultValue: "'x'", enumValues: "a, b" });
  const users = newTable({
    name: "users", description: "App users", items: [id, newGroup({ name: "Contact", description: "How to reach", columns: [email] })],
    indexes: [newIndex({ name: "", unique: true, columnIds: [email.id] })],
  });
  const uid = newColumn({ name: "user_id", dataType: "INT" });
  const orders = newTable({ name: "orders", items: [newColumn({ name: "id", dataType: "INT", primaryKey: true }), uid] });
  const empty = newTable({ name: "empty", items: [] });
  return {
    tableGroups: [newTableGroup({ name: "Core", description: "Core tables" })],
    tables: [users, orders, empty],
    relationships: [newRelationship({ fromTableId: orders.id, fromColumnId: uid.id, toTableId: users.id, toColumnId: id.id, onDelete: "CASCADE", label: "places" })],
    settings: { ...DEFAULT_SETTINGS },
  };
}

describe("data dictionary", () => {
  it("has a title, the descriptions, a summary line and the version / update time", () => {
    const md = buildDataDictionary(meta, design(), new Date("2026-11-12T00:00:00Z"), { version: 4, updatedAt: new Date(2026, 10, 12, 9, 5).toISOString(), modified: true }).markdown;
    expect(md.startsWith("# Shop — Data dictionary\n\n**Version:** 4 (edited since) · **Updated:** 2026-11-12 09:05\n\n> Demo shop\n\nLong text\n")).toBe(true);
    expect(md).toContain("\n\n<br>\n\n*3 tables · 4 columns · 1 relationship*\n\n");
    expect(buildDataDictionary(meta, design(), new Date(), { version: 0, updatedAt: new Date(2026, 0, 2, 3, 4).toISOString(), modified: false }).markdown)
      .toContain("Data dictionary\n\n**Version:** not saved yet · **Updated:** 2026-01-02 03:04\n");
    expect(buildDataDictionary(meta, design()).markdown).not.toContain("**Version:**");
  });

  it("lists tables by table group in the overview, with links", () => {
    const d = design();
    d.tables[0].groupId = d.tableGroups[0].id;
    const md = buildDataDictionary(meta, d).markdown;
    expect(md).toContain("| **Core** | 1 table | Core tables |");
    expect(md).toContain("| [users](#users-table) | 2 columns | App users |");
    expect(md).toContain("| **Ungrouped** | 2 tables |  |");
    expect(md).not.toMatch(/## (Overview|Tables)\n/);
    // an h2 per table group, then its tables; no group line inside a table
    expect(md).toContain("## Core Tables\n\nCore tables\n\n### users table\n\nApp users\n");
    expect(md).toContain("## Ungrouped Tables\n\n### orders table");
    expect(md).not.toContain("**Group:**");
    expect(slug("My Table")).toBe("my-table");
  });

  it("documents columns, constraints, column groups, indexes and relationships", () => {
    const md = buildDataDictionary(meta, design()).markdown;
    expect(md).toContain("### users table");
    expect(md).toContain("| PK | `id` | `INT` | IDENTITY | Key \\| pipe |");
    expect(md).toContain("#### Contact columns\n\nHow to reach");
    expect(md).toContain("UNIQUE<br>DEFAULT `'x'`<br>ENUM `a, b`");
    expect(md).toContain("#### Indexes");
    expect(md).toContain("## Relationships");
    expect(md).toContain("| `orders.user_id` | `users.id` | CASCADE | NO ACTION | places |");
    expect(md).toContain("| FK | `user_id` |");
    expect(md).toContain("### empty table\n\n*No columns.*");
  });

  it("builds the Markdown of a single table", () => {
    const d = design();
    const md = buildTableMarkdown(d, d.tables[0].id);
    expect(md.startsWith("### users table\n\nApp users\n")).toBe(true);
    expect(md).not.toContain("### orders table");
    expect(buildDataDictionary(meta, d).markdown).toContain(md.trimEnd());
    expect(buildTableMarkdown(d, "nope")).toBe("");
  });

  it("splits into blocks whose Markdown joins to the document", () => {
    const dd = buildDataDictionary(meta, design());
    expect(dd.blocks.map((b) => b.md).join("\n\n") + "\n").toBe(dd.markdown);
    expect(dd.blocks.filter((b) => b.table).length).toBeGreaterThan(2);
  });
});
