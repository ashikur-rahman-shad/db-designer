import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newTable } from "@/domain/factory";
import type { DesignData } from "@/domain/types";
import { exportJson, parseJson } from "./json";

describe("json round trip", () => {
  it("keeps table groups and assignments, and drops dangling group ids", () => {
    const a = newTable({ name: "a", groupId: "g1", items: [newColumn({ name: "id" })] });
    const b = newTable({ name: "b", groupId: "missing", items: [newColumn({ name: "id" })] });
    const data: DesignData = { tableGroups: [{ id: "g1", name: "Core", description: "d" }], tables: [a, b], relationships: [], settings: { ...DEFAULT_SETTINGS } };
    const r = parseJson(exportJson({ name: "x", shortDescription: "", longDescription: "" }, data));
    expect(r.data.tableGroups).toEqual([{ id: "g1", name: "Core", description: "d" }]);
    expect(r.data.tables[0].groupId).toBe("g1");
    expect(r.data.tables[1].groupId).toBeNull();
  });
});

describe("indexes in JSON", () => {
  it("round-trips indexes and drops invalid ones", async () => {
    const { newColumn, newTable, DEFAULT_SETTINGS } = await import("@/domain/factory");
    const { exportJson, parseJson } = await import("./json");
    const a = newColumn({ name: "a" }), b = newColumn({ name: "b" });
    const t = newTable({ items: [a, b], indexes: [{ id: "i1", name: "ux", columnIds: [a.id, b.id], unique: true }] });
    const meta = { name: "D", shortDescription: "", longDescription: "" };
    const text = exportJson(meta, { tableGroups: [], tables: [t], relationships: [], settings: { ...DEFAULT_SETTINGS } });
    expect(parseJson(text).data.tables[0].indexes).toEqual(t.indexes);
    const raw = JSON.parse(text);
    raw.tables[0].indexes.push({ id: "bad", columnIds: ["ghost"] }, { id: "bad2" });
    expect(parseJson(JSON.stringify(raw)).data.tables[0].indexes).toHaveLength(1);
  });
});
