import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newGroup, newTable } from "./factory";
import { layoutTable } from "./layout";
import type { LayoutRow } from "./layout";

const opts = { ...DEFAULT_SETTINGS, descriptionStyle: "inline" as const };
const colRow = (rows: LayoutRow[], id: string) => rows.find((r) => r.type === "column" && r.id === id) as Extract<LayoutRow, { type: "column" }>;
const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

describe("layoutTable", () => {
  const long = "This is a very long description that must wrap onto several lines instead of widening the table forever";
  const id = newColumn({ name: "id", dataType: "INTEGER", primaryKey: true });
  const status = newColumn({ name: "status", dataType: "VARCHAR(20)", notNull: true, unique: true, enumValues: "draft, paid, shipped", description: long });
  const mk = (autoWidth: boolean, width = 240) => newTable({ autoWidth, width, name: "t", items: [id, status] });

  it("stacks PK / FK / tags in the key cell: one line each, only when applicable", () => {
    const l = layoutTable(mk(true), { ...opts, fkColumnIds: [id.id] });
    const r = colRow(l.rows, id.id);
    expect(r).toMatchObject({ pk: true, fk: true, tags: [] });
    const s = colRow(l.rows, status.id);
    expect(s).toMatchObject({ pk: false, fk: false, tags: ["UQ", "NN"] });
  });

  it("a PK+FK+tags column is tall enough for its three key lines", () => {
    const c = newColumn({ name: "x", primaryKey: true, unique: true });
    const l = layoutTable(newTable({ items: [c] }), { ...opts, fkColumnIds: [c.id] });
    expect(colRow(l.rows, c.id).height).toBeGreaterThanOrEqual(3 * 14 + 16);
  });

  it("inline mode: description and enum pills sit under the name (no desc/enum columns)", () => {
    const l = layoutTable(mk(true), opts);
    expect(l.cols.desc).toBe(0);
    expect(l.cols.enum).toBe(0);
    const r = colRow(l.rows, status.id);
    expect(r.descLines.length).toBeGreaterThan(1);
    expect(r.enumLines.flat()).toEqual(["draft", "paid", "shipped"]);
    expect(r.height).toBeGreaterThan(50);
    expect(r.height % 10).toBe(0);
    expect(sum(l.cols)).toBe(l.width);
  });

  it("column mode (detail dialog): description and enum values are separate columns", () => {
    const l = layoutTable(mk(true), { ...opts, descriptionStyle: "column" });
    expect(l.cols.desc).toBeGreaterThan(0);
    expect(l.cols.enum).toBeGreaterThan(0);
    expect(sum(l.cols)).toBe(l.width);
    expect(l.width % 10).toBe(0);
    expect(colRow(l.rows, status.id).enumLines.flat()).toEqual(["draft", "paid", "shipped"]);
  });

  it("auto width gets wider for a longer name; fixed width is honored", () => {
    const a = layoutTable(mk(true), opts).width;
    const t = mk(true);
    (t.items[0] as ReturnType<typeof newColumn>).name = "a_really_really_long_column_name_here";
    expect(layoutTable(t, opts).width).toBeGreaterThan(a);
    const f = layoutTable(mk(false, 300), opts);
    expect(f.width).toBe(300);
    expect(sum(f.cols)).toBe(300);
  });

  it("anchors stay on the grid and inside their row", () => {
    const l = layoutTable(mk(true), opts);
    for (const r of l.rows) {
      if (r.type !== "column") continue;
      const y = l.anchorY[r.id];
      expect(y % 10).toBe(0);
      expect(y).toBeGreaterThanOrEqual(r.top);
      expect(y).toBeLessThanOrEqual(r.top + r.height);
    }
  });

  it("hides attributes (tags, enum) when turned off, but keeps PK/FK", () => {
    const l = layoutTable(mk(true), { ...opts, showAttributes: false, showDescriptions: false, fkColumnIds: [id.id] });
    const s = colRow(l.rows, status.id);
    expect(s.tags).toEqual([]);
    expect(s.enumLines).toEqual([]);
    expect(s.descLines).toEqual([]);
    expect(colRow(l.rows, id.id)).toMatchObject({ pk: true, fk: true });
  });

  it("details column only in detail mode", () => {
    const c = newColumn({ name: "a", defaultValue: "0", check: "a > 0" });
    const t = newTable({ items: [c] });
    expect(layoutTable(t, { ...opts, descriptionStyle: "column" }).cols.details).toBe(0);
    const l = layoutTable(t, { ...opts, descriptionStyle: "column", detail: true });
    expect(l.cols.details).toBeGreaterThan(0);
    expect(colRow(l.rows, c.id).detailLines.join(" ")).toContain("default 0");
  });

  it("collapsedIds collapses a group even in expandAll mode", () => {
    const g = newGroup({ name: "G", columns: [newColumn({ name: "a" }), newColumn({ name: "b" })] });
    const t = newTable({ items: [g] });
    const open = layoutTable(t, { ...opts, expandAll: true, collapsedIds: [] });
    const closed = layoutTable(t, { ...opts, expandAll: true, collapsedIds: [g.id] });
    expect(open.rows.filter((r) => r.type === "column")).toHaveLength(2);
    expect(closed.rows.filter((r) => r.type === "column")).toHaveLength(0);
    expect(closed.height).toBeLessThan(open.height);
  });
});

describe("logical view: mandatory column properties", () => {
  const mk = () => {
    const pk = newColumn({ name: "pk", primaryKey: true, logicalErd: false });
    const fk = newColumn({ name: "fk", logicalErd: false });
    const nn = newColumn({ name: "nn", notNull: true, logicalErd: false });
    const uq = newColumn({ name: "uq", unique: true, logicalErd: false });
    const ai = newColumn({ name: "ai", autoIncrement: true, logicalErd: false });
    const plain = newColumn({ name: "plain", logicalErd: false });
    const on = newColumn({ name: "on", logicalErd: true });
    const g = newGroup({ name: "G", columns: [plain, nn] });
    return { pk, fk, nn, uq, ai, plain, on, t: newTable({ items: [pk, fk, uq, ai, on, g] }) };
  };
  const ids = (l: ReturnType<typeof layoutTable>) => l.rows.filter((r) => r.type === "column").map((r) => r.id);
  const base = { ...DEFAULT_SETTINGS, viewMode: "logical" as const };

  it("default (PK + FK): they show even though their own logical flag is off", () => {
    const { pk, fk, on, t } = mk();
    const l = layoutTable(t, { ...base, fkColumnIds: [fk.id] });
    expect(ids(l)).toEqual([pk.id, fk.id, on.id]);
  });

  it("any combination: NN, UQ, AI can be made mandatory too (also inside groups)", () => {
    const { pk, fk, nn, uq, ai, on, t } = mk();
    const l = layoutTable(t, { ...base, fkColumnIds: [fk.id], logicalMandatory: ["pk", "fk", "nn", "uq", "ai"] });
    expect(ids(l)).toEqual([pk.id, fk.id, uq.id, ai.id, on.id, nn.id]);
    expect(l.rows.some((r) => r.type === "group")).toBe(false); // logical view always hides groups: nn (in the group) is shown flat
  });

  it("with nothing mandatory only columns flagged logical show (and an all-hidden group disappears)", () => {
    const { on, t } = mk();
    const l = layoutTable(t, { ...base, logicalMandatory: [] });
    expect(ids(l)).toEqual([on.id]);
    expect(l.rows.some((r) => r.type === "group")).toBe(false);
  });

  it("full view is unaffected", () => {
    const { t } = mk();
    expect(ids(layoutTable(t, { ...DEFAULT_SETTINGS, viewMode: "full" }))).toHaveLength(7);
  });
});

import { normalizeDesignData } from "./factory";
describe("logicalMandatory setting", () => {
  it("defaults to PK + FK, keeps valid saved values, drops junk", () => {
    expect(normalizeDesignData({}).settings.logicalMandatory).toEqual(["pk", "fk"]);
    expect(normalizeDesignData({ settings: { logicalMandatory: ["nn", "bogus", "nn", "ai"] } as never }).settings.logicalMandatory).toEqual(["nn", "ai"]);
    expect(normalizeDesignData({ settings: { logicalMandatory: [] } as never }).settings.logicalMandatory).toEqual([]);
  });
});

describe("hideGroups: columns shown as if column groups did not exist", () => {
  const a = newColumn({ name: "a" }), b = newColumn({ name: "b" }), c = newColumn({ name: "c" }), d = newColumn({ name: "d", logicalErd: false });
  const g = newGroup({ name: "G", collapsed: true, columns: [b, c, d] });
  const t = newTable({ items: [a, g] });
  const ids = (l: ReturnType<typeof layoutTable>, type: string) => l.rows.filter((r) => r.type === type).map((r) => r.id);

  it("no group rows; every column appears in order, even if the group is collapsed", () => {
    const l = layoutTable(t, { ...opts, hideGroups: true });
    expect(ids(l, "group")).toEqual([]);
    expect(ids(l, "column")).toEqual([a.id, b.id, c.id, d.id]);
    expect(l.rows.filter((r) => r.type === "column").every((r) => (r as { groupId?: string }).groupId === undefined)).toBe(true);
    // collapsed groups normally hide their columns
    expect(ids(layoutTable(t, opts), "column")).toEqual([a.id]);
  });

  it("still honours the logical view per column", () => {
    const l = layoutTable(t, { ...opts, hideGroups: true, viewMode: "logical", logicalMandatory: [] });
    expect(ids(l, "column")).toEqual([a.id, b.id, c.id]); // d is not logical
  });

  it("the detail dialog (expandAll) keeps its groups", () => {
    expect(ids(layoutTable(t, { ...opts, hideGroups: true, expandAll: true }), "group")).toEqual([g.id]);
  });
});

describe("logical view automatically hides column groups", () => {
  const a = newColumn({ name: "a", logicalErd: true });
  const b = newColumn({ name: "b", logicalErd: true });
  const c = newColumn({ name: "c", logicalErd: true });
  const g = newGroup({ name: "G", columns: [b, c] }); // expanded group
  const t = newTable({ items: [a, g] });
  const kinds = (l: ReturnType<typeof layoutTable>) => l.rows.map((r) => r.type);

  it("full view shows the group; logical view shows the same columns flat, with no group rows", () => {
    expect(kinds(layoutTable(t, { ...DEFAULT_SETTINGS, viewMode: "full" }))).toEqual(["column", "group", "column", "column"]);
    const logical = layoutTable(t, { ...DEFAULT_SETTINGS, viewMode: "logical" });
    expect(kinds(logical)).toEqual(["column", "column", "column"]);
    expect(logical.rows.map((r) => r.id)).toEqual([a.id, b.id, c.id]);
  });

  it("a collapsed group does not hide its columns in logical view", () => {
    g.collapsed = true;
    expect(layoutTable(t, { ...DEFAULT_SETTINGS, viewMode: "logical" }).rows.map((r) => r.id)).toEqual([a.id, b.id, c.id]);
    expect(layoutTable(t, { ...DEFAULT_SETTINGS, viewMode: "full" }).rows.map((r) => r.id)).toEqual([a.id, g.id]);
    g.collapsed = false;
  });

  it("the detail dialog (expandAll) still shows groups in logical view", () => {
    expect(kinds(layoutTable(t, { ...DEFAULT_SETTINGS, viewMode: "logical", expandAll: true }))).toContain("group");
  });
});
