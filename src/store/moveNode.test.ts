import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newGroup, newTable } from "@/domain/factory";
import { exportSql } from "@/lib/sql/export";
import { parseSql } from "@/lib/sql/import";
import { useEditor } from "./editorStore";

const names = (t: ReturnType<typeof newTable>) =>
  t.items.map((i) => (i.kind === "group" ? `[${i.name}:${i.columns.map((c) => c.name).join(",")}]` : i.name)).join(" ");

function setup() {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => newColumn({ name }));
  const g = newGroup({ name: "G", columns: [c, d] });
  const t = newTable({ items: [a, b, g] });
  useEditor.setState({ data: { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } } });
  return { t, a, b, c, d, g };
}
const cur = () => useEditor.getState().data.tables[0];

describe("moveNode", () => {
  it("moves a column into a group before another column", () => {
    const { t, a, d } = setup();
    useEditor.getState().moveNode(t.id, a.id, cur().items[2].id, d.id);
    expect(names(cur())).toBe("b [G:c,a,d]");
  });
  it("moves a column out of a group to the root", () => {
    const { t, c, b } = setup();
    useEditor.getState().moveNode(t.id, c.id, null, b.id);
    expect(names(cur())).toBe("a c b [G:d]");
  });
  it("reorders groups but never nests them", () => {
    const { t, g, a } = setup();
    useEditor.getState().moveNode(t.id, g.id, null, a.id);
    expect(names(cur())).toBe("[G:c,d] a b");
    useEditor.getState().moveNode(t.id, g.id, g.id, null);
    expect(names(cur())).toBe("[G:c,d] a b");
  });
});

describe("enum", () => {
  it("round trips through SQL", () => {
    const t = newTable({ items: [newColumn({ name: "status", enumValues: "draft, paid" })] });
    const sql = exportSql({ name: "x", shortDescription: "", longDescription: "" }, { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } });
    expect(parseSql(sql).data.tables[0].items[0]).toMatchObject({ enumValues: "draft, paid" });
  });
});

describe("table groups & column group collapse", () => {
  it("create, assign, delete (tables become ungrouped)", () => {
    const { t } = setup();
    const st = useEditor.getState();
    const id = st.addTableGroup("Sales", "desc");
    st.setTableGroup(t.id, id);
    expect(useEditor.getState().data.tables[0].groupId).toBe(id);
    expect(useEditor.getState().data.tableGroups[0]).toMatchObject({ name: "Sales", description: "desc" });
    st.deleteTableGroup(id);
    expect(useEditor.getState().data.tables[0].groupId).toBeNull();
    expect(useEditor.getState().data.tableGroups).toHaveLength(0);
  });
  it("collapse / unfold all column groups", () => {
    setup();
    const groupOf = () => cur().items.find((i) => i.kind === "group") as ReturnType<typeof newGroup>;
    useEditor.getState().setAllColumnGroupsCollapsed(true);
    expect(groupOf().collapsed).toBe(true);
    useEditor.getState().setAllColumnGroupsCollapsed(false);
    expect(groupOf().collapsed).toBe(false);
  });
});

describe("viewing an old version is read-only", () => {
  it("blocks data edits and saving, but allows local view options", async () => {
    const { t } = setup();
    useEditor.setState({ rev: 0, saveStatus: "saved", viewing: { version: 1, createdAt: "x", note: "" } });
    const st = useEditor.getState();
    st.updateTable(t.id, { name: "HACKED" });
    st.addTable(0, 0);
    st.deleteTable(t.id);
    st.moveNode(t.id, cur().items[0].id, null, null);
    expect(cur().name).not.toBe("HACKED");
    expect(useEditor.getState().data.tables).toHaveLength(1);
    expect(useEditor.getState().rev).toBe(0);
    // view options still work (locally) and don't mark the document dirty
    st.updateSettings({ viewMode: "logical" });
    st.setAllColumnGroupsCollapsed(true);
    expect(useEditor.getState().data.settings.viewMode).toBe("logical");
    expect(useEditor.getState().rev).toBe(0);
    expect(useEditor.getState().saveStatus).toBe("saved");
    // saving is refused outright (no network call is even attempted)
    const { saveNow } = await import("@/lib/designApi");
    expect(await saveNow()).toBe(false);
    useEditor.setState({ viewing: null });
  });
});

describe("view state is not an edit; load applies remembered view options", () => {
  const dirty = () => useEditor.getState().rev;

  it("collapsing groups and changing view options never mark the design as modified", () => {
    setup();
    useEditor.setState({ rev: 0, saveStatus: "saved", viewing: null, versionInfo: { latest: 1, changedSinceVersion: false } });
    const st = useEditor.getState();
    st.setAllColumnGroupsCollapsed(true);
    st.updateSettings({ showGrid: false, viewMode: "logical" });
    const g = cur().items.find((i) => i.kind === "group") as ReturnType<typeof newGroup>;
    st.updateGroup(cur().id, g.id, { collapsed: false });
    expect(dirty()).toBe(0);
    expect(useEditor.getState().saveStatus).toBe("saved");
    expect(useEditor.getState().versionInfo.changedSinceVersion).toBe(false);
    expect(useEditor.getState().data.settings.showGrid).toBe(false);
    // ...but a design setting and a real edit are edits
    st.updateSettings({ cornerRadius: 4 });
    expect(dirty()).toBe(1);
    st.updateTable(cur().id, { name: "renamed" });
    expect(dirty()).toBe(2);
  });

  it("load: remembered view options override the design's, and groups start collapsed", () => {
    const { t } = setup();
    const design = {
      id: "d1", name: "n", shortDescription: "", longDescription: "", createdAt: "", updatedAt: "",
      data: { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS, showGrid: true, cornerRadius: 3 } },
    };
    useEditor.getState().load(design, undefined, null, { viewMode: "logical", showGrid: false, showLabels: false, showMarkers: true, showAttributes: true, showDescriptions: false, hideGroups: false, panelOpen: false, undoLimit: 50 });
    const s = useEditor.getState();
    expect(s.data.settings).toMatchObject({ showGrid: false, viewMode: "logical", showLabels: false, showDescriptions: false, cornerRadius: 3 });
    expect(s.panelOpen).toBe(false);
    expect(s.data.tables[0].items.filter((i) => i.kind === "group").every((g) => (g as ReturnType<typeof newGroup>).collapsed)).toBe(true);
    expect(design.data.tables[0].items.some((i) => i.kind === "group" && !i.collapsed)).toBe(true); // props not mutated
    expect(s.rev).toBe(0);
    // loading again without options keeps the current view options (e.g. after a restore)
    useEditor.getState().load(design);
    expect(useEditor.getState().data.settings.showGrid).toBe(false);
    expect(useEditor.getState().panelOpen).toBe(false);
  });

  it("selecting columns and groups is independent of editing", () => {
    const { t, c } = setup();
    useEditor.getState().select({ type: "column", tableId: t.id, id: c.id });
    expect(useEditor.getState().selection).toEqual({ type: "column", tableId: t.id, id: c.id });
  });
});

describe("multi-table selection and group actions", () => {
  function three() {
    const mk = (name: string, x: number) => newTable({ name, x, y: 0, items: [newColumn({ name: "id" })] });
    const [a, b, c] = [mk("a", 0), mk("b", 300), mk("c", 600)];
    useEditor.setState({
      data: { tableGroups: [], tables: [a, b, c], relationships: [], settings: { ...DEFAULT_SETTINGS } },
      selection: null, rev: 0, saveStatus: "saved", viewing: null,
    });
    return { a, b, c };
  }
  const sel = () => useEditor.getState().selection;

  it("Ctrl+click toggles tables; one table collapses to a single selection, none to null", () => {
    const { a, b, c } = three();
    const st = useEditor.getState();
    st.select({ type: "table", id: a.id });
    st.toggleTableSelection(b.id);
    expect(sel()).toEqual({ type: "tables", ids: [a.id, b.id] });
    st.toggleTableSelection(c.id);
    expect(sel()).toEqual({ type: "tables", ids: [a.id, b.id, c.id] });
    st.toggleTableSelection(a.id);
    st.toggleTableSelection(c.id);
    expect(sel()).toEqual({ type: "table", id: b.id });
    st.toggleTableSelection(b.id);
    expect(sel()).toBeNull();
  });

  it("Ctrl+click while a column is selected starts from that column's table", () => {
    const { a, b } = three();
    const colId = (useEditor.getState().data.tables[0].items[0] as { id: string }).id;
    useEditor.getState().select({ type: "column", tableId: a.id, id: colId });
    useEditor.getState().toggleTableSelection(b.id);
    expect(sel()).toEqual({ type: "tables", ids: [a.id, b.id] });
  });

  it("selectAllTables / selectTables normalise counts and ignore unknown ids", () => {
    const { a, b, c } = three();
    const st = useEditor.getState();
    st.selectAllTables();
    expect(sel()).toEqual({ type: "tables", ids: [a.id, b.id, c.id] });
    st.selectTables([a.id, "nope", a.id]);
    expect(sel()).toEqual({ type: "table", id: a.id });
    st.selectTables([]);
    expect(sel()).toBeNull();
    // selecting is not an edit
    expect(useEditor.getState().rev).toBe(0);
  });

  it("moveTables moves all in ONE change, snapped to the grid", () => {
    const { a, b } = three();
    useEditor.getState().moveTables([{ id: a.id, x: 13, y: 27 }, { id: b.id, x: 312, y: 8 }]);
    const t = useEditor.getState().data.tables;
    expect([t[0].x, t[0].y, t[1].x, t[1].y]).toEqual([10, 30, 310, 10]);
    expect(useEditor.getState().rev).toBe(1);
  });

  it("updateTables / setTablesGroup / deleteTables apply to every selected table", () => {
    const { a, b, c } = three();
    const st = useEditor.getState();
    st.updateTables([a.id, b.id], { color: "#ef4444" });
    expect(useEditor.getState().data.tables.map((t) => t.color)).toEqual(["#ef4444", "#ef4444", c.color]);
    const g = st.addTableGroup("Core");
    st.setTablesGroup([a.id, c.id], g);
    expect(useEditor.getState().data.tables.map((t) => t.groupId)).toEqual([g, null, g]);
    st.deleteTables([a.id, b.id]);
    expect(useEditor.getState().data.tables.map((t) => t.name)).toEqual(["c"]);
    expect(sel()).toBeNull();
  });

  it("are blocked while an old version is open", () => {
    const { a, b } = three();
    useEditor.setState({ viewing: { version: 1, createdAt: "x", note: "" } });
    const st = useEditor.getState();
    st.moveTables([{ id: a.id, x: 900, y: 900 }]);
    st.updateTables([a.id, b.id], { color: "#000000" });
    st.deleteTables([a.id]);
    expect(useEditor.getState().data.tables).toHaveLength(3);
    expect(useEditor.getState().data.tables[0].x).toBe(0);
    st.selectAllTables(); // ...but selecting still works
    expect(sel()).toMatchObject({ type: "tables" });
    useEditor.setState({ viewing: null });
  });
});

describe("relationship label position", () => {
  it("is an edit that can be set and reset", () => {
    const { t, c } = setup();
    const st = useEditor.getState();
    st.setForeignKey(t.id, c.id, { tableId: t.id, columnId: c.id });
    const id = useEditor.getState().data.relationships[0].id;
    expect(useEditor.getState().data.relationships[0].labelPos).toBeNull();
    useEditor.setState({ rev: 0 });
    st.updateRelationship(id, { labelPos: { from: "start", distance: 40 } });
    expect(useEditor.getState().data.relationships[0].labelPos).toEqual({ from: "start", distance: 40 });
    expect(useEditor.getState().rev).toBe(1);
    st.updateRelationship(id, { labelPos: null });
    expect(useEditor.getState().data.relationships[0].labelPos).toBeNull();
  });
});
