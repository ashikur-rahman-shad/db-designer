import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newTable } from "@/domain/factory";
import { useEditor } from "./editorStore";

function open(limit = 50) {
  const a = newColumn({ name: "a", primaryKey: true }), b = newColumn({ name: "b" });
  const t = newTable({ id: "t1", name: "t", items: [a, b] });
  useEditor.getState().load(
    { id: "d", name: "n", shortDescription: "", longDescription: "", createdAt: "", updatedAt: "", data: { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } } },
    undefined, null, { viewMode: "full", showGrid: true, showLabels: true, showMarkers: true, showAttributes: true, showDescriptions: true, hideGroups: false, panelOpen: true, undoLimit: limit },
  );
  return { a, b };
}
const name = () => useEditor.getState().data.tables[0].name;

describe("undo / redo", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });

  it("steps back and forth; a new edit clears redo", () => {
    open();
    const s = useEditor.getState();
    s.updateTable("t1", { name: "one" });
    vi.advanceTimersByTime(1000);
    s.updateTable("t1", { name: "two" });
    expect(useEditor.getState().past).toHaveLength(2);
    useEditor.getState().undo();
    expect(name()).toBe("one");
    useEditor.getState().undo();
    expect(name()).toBe("t");
    useEditor.getState().redo();
    expect(name()).toBe("one");
    vi.advanceTimersByTime(1000);
    useEditor.getState().updateTable("t1", { name: "three" });
    expect(useEditor.getState().future).toHaveLength(0);
    useEditor.getState().redo();
    expect(name()).toBe("three");
    expect(useEditor.getState().rev).toBeGreaterThan(0);
  });

  it("merges edits in quick succession (typing) into one step", () => {
    open();
    const s = useEditor.getState();
    for (const n of ["x", "xy", "xyz"]) { s.updateTable("t1", { name: n }); vi.advanceTimersByTime(100); }
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(name()).toBe("t");
  });

  it("keeps at most `undoLimit` steps; 0 disables undo; lowering the limit trims", () => {
    open(2);
    for (const n of ["1", "2", "3", "4"]) { useEditor.getState().updateTable("t1", { name: n }); vi.advanceTimersByTime(1000); }
    expect(useEditor.getState().past).toHaveLength(2);
    useEditor.getState().setUndoLimit(1);
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().setUndoLimit(0);
    useEditor.getState().updateTable("t1", { name: "off" });
    expect(useEditor.getState().past).toHaveLength(0);
    useEditor.getState().undo();
    expect(name()).toBe("off");
  });

  it("does not undo view state (collapsed groups, grid) and clears on load", () => {
    open();
    const st = useEditor.getState();
    st.addGroup("t1");
    vi.advanceTimersByTime(1000);
    const gid = useEditor.getState().data.tables[0].items.find((i) => i.kind === "group")!.id;
    useEditor.getState().updateGroup("t1", gid, { collapsed: true });
    useEditor.getState().updateSettings({ showGrid: false });
    useEditor.getState().updateTable("t1", { name: "z" });
    useEditor.getState().undo();
    const g = useEditor.getState().data.tables[0].items.find((i) => i.kind === "group");
    expect(name()).toBe("t");
    expect(g && g.kind === "group" && g.collapsed).toBe(true);
    expect(useEditor.getState().data.settings.showGrid).toBe(false);
    open();
    expect(useEditor.getState().past).toHaveLength(0);
  });
});

describe("indexes and primary key", () => {
  it("adds, edits, prunes on column delete, and sets a composite primary key", () => {
    const { a, b } = open();
    const s = useEditor.getState();
    const id = s.addIndex("t1", { columnIds: [a.id, b.id], unique: true });
    expect(useEditor.getState().data.tables[0].indexes).toEqual([{ id, name: "", columnIds: [a.id, b.id], unique: true }]);
    useEditor.getState().updateIndex("t1", id, { name: "ux", columnIds: [b.id, a.id, b.id, "nope"] });
    expect(useEditor.getState().data.tables[0].indexes[0]).toMatchObject({ name: "ux", columnIds: [b.id, a.id] });
    useEditor.getState().setPrimaryKey("t1", [a.id, b.id]);
    const cols = useEditor.getState().data.tables[0].items.filter((i) => i.kind === "column");
    expect(cols.every((c) => c.primaryKey && c.notNull)).toBe(true);
    useEditor.getState().deleteColumn("t1", a.id);
    expect(useEditor.getState().data.tables[0].indexes[0].columnIds).toEqual([b.id]);
    useEditor.getState().deleteColumn("t1", b.id);
    expect(useEditor.getState().data.tables[0].indexes).toEqual([]);
  });
});
