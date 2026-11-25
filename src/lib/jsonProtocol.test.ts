import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/factory";
import { allColumns } from "@/domain/model";
import { routeRelationship } from "@/domain/routing";
import { exportJson, parseJson } from "./json";
import { validateDesignData } from "./jsonValidate";

const doc = fs.readFileSync(path.join(process.cwd(), "docs", "JSON_PROTOCOL.md"), "utf8");
const example = /```json\n([\s\S]*?\n)```/.exec(doc)![1];

describe("docs/JSON_PROTOCOL.md example", () => {
  const parsed = parseJson(example);

  it("is valid JSON that the importer accepts, and passes every documented rule", () => {
    expect(JSON.parse(example).format).toBe("dbdesigner");
    expect(parsed.meta.name).toBe("Webshop");
    expect(parsed.data.tableGroups.map((g) => g.name)).toEqual(["Customers", "Sales"]);
    expect(parsed.data.tables.map((t) => t.name)).toEqual(["users", "orders", "order_items"]);
    expect(parsed.data.relationships).toHaveLength(2);
    expect(validateDesignData(parsed.data)).toEqual([]);
  });

  it("every relationship is drawable (routes resolve) and the FK columns are the documented ones", () => {
    for (const r of parsed.data.relationships) expect(routeRelationship(r, parsed.data)).not.toBeNull();
    const fkCols = new Set(parsed.data.relationships.map((r) => r.fromColumnId));
    const names = parsed.data.tables.flatMap((t) => allColumns(t).filter((c) => fkCols.has(c.id)).map((c) => `${t.name}.${c.name}`));
    expect(names.sort()).toEqual(["order_items.order_id", "orders.user_id"]);
  });

  it("survives export -> import unchanged (computed fields are not needed)", () => {
    const again = parseJson(exportJson(parsed.meta as never, parsed.data));
    expect(again.data.tables.map((t) => t.items)).toEqual(parsed.data.tables.map((t) => t.items));
    expect(again.data.relationships).toEqual(parsed.data.relationships);
    expect(again.data.tableGroups).toEqual(parsed.data.tableGroups);
    expect(validateDesignData(again.data)).toEqual([]);
  });

  it("exported files contain the documented computed fields, which the importer ignores", () => {
    const out = JSON.parse(exportJson(parsed.meta as never, parsed.data));
    expect(typeof out.tables[0].height).toBe("number");
    expect(out.relationships[0].route).toMatchObject({ fromSide: expect.any(String), toSide: expect.any(String), points: expect.any(Array) });
    out.tables[0].height = 99999;
    out.relationships[0].route.points = [{ x: 1, y: 1 }];
    const back = parseJson(JSON.stringify(out));
    expect("height" in back.data.tables[0]).toBe(false);          // dropped, not stored
    expect("route" in back.data.relationships[0]).toBe(false);
    expect(routeRelationship(back.data.relationships[0], back.data)!.points.length).toBeGreaterThan(1); // the route is recomputed
  });
});

describe("importer behaviour documented in the protocol", () => {
  const wrap = (o: object) => JSON.stringify({ format: "dbdesigner", ...o });

  it("rejects a file without the format marker; accepts anything else", () => {
    expect(() => parseJson(JSON.stringify({ tables: [] }))).toThrow(/Not a DB Designer JSON/);
    expect(() => parseJson(wrap({ version: 99 }))).not.toThrow();
    const empty = parseJson(wrap({}));
    expect(empty.data.tables).toEqual([]);
    expect(empty.data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("applies the documented defaults for missing fields", () => {
    const { data } = parseJson(wrap({
      tableGroups: [{ id: "g" }],
      tables: [{ id: "t", items: [{ kind: "column", id: "c" }, { kind: "group", id: "gr", columns: [{ id: "c2" }] }] }],
      relationships: [{ id: "r", fromTableId: "t", fromColumnId: "c", toTableId: "t", toColumnId: "c2" }],
    }));
    expect(data.tableGroups[0]).toEqual({ id: "g", name: "group", description: "" });
    const t = data.tables[0];
    expect(t).toMatchObject({ name: "new_table", description: "", color: "#3b82f6", groupId: null, x: 0, y: 0, width: 240, autoWidth: true });
    expect(t.items[0]).toEqual({
      kind: "column", id: "c", name: "column", dataType: "VARCHAR(255)", primaryKey: false, notNull: false, unique: false,
      autoIncrement: false, defaultValue: "", check: "", description: "", enumValues: "", logicalErd: true, // <- true, as documented
    });
    expect(t.items[1]).toMatchObject({ kind: "group", name: "group", description: "", collapsed: false });
    expect(data.relationships[0]).toEqual({
      id: "r", fromTableId: "t", fromColumnId: "c", toTableId: "t", toColumnId: "c2",
      onDelete: "NO ACTION", onUpdate: "NO ACTION", label: "", bend: 0, labelPos: null,
    });
    expect(DEFAULT_SETTINGS).toMatchObject({
      logicalMandatory: ["pk", "fk"], cornerRadius: 10, lineWidth: 1.5, lineColor: "#64748b", stubLength: 20, defaultTableColor: "#3b82f6",
      viewMode: "full", showGrid: true, showMarkers: true, showLabels: true, showAttributes: true, showDescriptions: true, hideGroups: false,
    });
  });

  it("snaps to the grid, enforces min width, and repairs the documented fields", () => {
    const { data } = parseJson(wrap({
      tableGroups: [{ id: "g", name: "G" }],
      settings: { logicalMandatory: ["nn", "bogus", "nn"] },
      tables: [
        { id: "a", x: 13, y: 27, width: 100, autoWidth: false, groupId: "g", items: [] },
        { id: "b", groupId: "does-not-exist", items: [] },
      ],
      relationships: [{ id: "r", fromTableId: "a", fromColumnId: "x", toTableId: "b", toColumnId: "y", labelPos: { from: "middle", distance: 3 } }],
    }));
    expect([data.tables[0].x, data.tables[0].y, data.tables[0].width]).toEqual([10, 30, 160]);
    expect(data.tables[0].groupId).toBe("g");
    expect(data.tables[1].groupId).toBeNull();
    expect(data.settings.logicalMandatory).toEqual(["nn"]);
    expect(data.relationships[0].labelPos).toBeNull();
  });

  it("does NOT repair broken references (so the validator must catch them)", () => {
    const { data } = parseJson(wrap({
      tables: [{ id: "a", name: "a", items: [{ kind: "column", id: "c", name: "id", primaryKey: true, notNull: true }] }],
      relationships: [{ id: "r", fromTableId: "a", fromColumnId: "c", toTableId: "ghost", toColumnId: "nope" }],
    }));
    expect(data.relationships).toHaveLength(1);                       // kept
    expect(routeRelationship(data.relationships[0], data)).toBeNull(); // but never drawn
    expect(validateDesignData(data).join("\n")).toContain("does not exist");
  });
});

describe("validateDesignData (checklist rules)", () => {
  const base = () => parseJson(example).data;
  const problems = (mutate: (d: ReturnType<typeof base>) => void) => { const d = base(); mutate(d); return validateDesignData(d).join("\n"); };

  it("flags duplicate ids, dangling references, bad groupId and duplicate names", () => {
    expect(problems((d) => { d.tables[1].id = d.tables[0].id; })).toMatch(/duplicate id/);
    expect(problems((d) => { d.relationships[0].toColumnId = "nope"; })).toMatch(/does not exist/);
    expect(problems((d) => { d.relationships[0].fromColumnId = "col_users_id"; })).toMatch(/does not exist/); // column exists, but not in that table
    expect(problems((d) => { d.tables[0].groupId = "nope"; })).toMatch(/groupId "nope"/);
    expect(problems((d) => { d.tables[1].name = "USERS"; })).toMatch(/two tables are named/);
    expect(problems((d) => { d.tableGroups[1].name = "customers"; })).toMatch(/two table groups/);
  });

  it("warns about non-key reference targets, nullable primary keys and double foreign keys", () => {
    expect(problems((d) => { d.relationships[0].toColumnId = "col_users_phone"; })).toMatch(/neither primaryKey nor unique/);
    expect(problems((d) => { (d.tables[0].items[0] as { notNull: boolean }).notNull = false; })).toMatch(/should also be notNull/);
    expect(problems((d) => { d.relationships.push({ ...d.relationships[0], id: "rel_dup" }); })).toMatch(/more than one relationship/);
  });

  it("reports nothing for a clean design", () => {
    expect(validateDesignData(base())).toEqual([]);
  });
});
