import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newRelationship, newTable } from "@/domain/factory";
import type { DesignData } from "@/domain/types";
import { buildDrawioXml, tint } from "./drawio";

const meta = { name: "Shop", shortDescription: "", longDescription: "" };
function design(): DesignData {
  const id = newColumn({ name: "id", dataType: "INT", primaryKey: true });
  const uid = newColumn({ name: "user_id", dataType: "INT" });
  const users = newTable({ name: "users <x>", color: "#3b82f6", x: 0, y: 0, items: [id] });
  const orders = newTable({ name: "orders", color: "#ef4444", x: 400, y: 100, items: [newColumn({ name: "id", primaryKey: true }), uid] });
  const rel = newRelationship({ fromTableId: orders.id, fromColumnId: uid.id, toTableId: users.id, toColumnId: id.id, label: "places" });
  return { tableGroups: [], tables: [users, orders], relationships: [rel], settings: { ...DEFAULT_SETTINGS } };
}

describe("drawio export", () => {
  it("builds an mxfile with cells and a connected ER edge with a label", () => {
    const xml = buildDrawioXml(meta, design());
    expect(xml.startsWith('<mxfile host="Electron" agent="DB Designer">\n  <diagram')).toBe(true);
    expect(xml).toContain('name="Shop"');
    const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const edge = /<mxCell[^>]*edge="1"[^>]*>/.exec(xml)![0];
    const src = /source="([^"]+)"/.exec(edge)![1], tgt = /target="([^"]+)"/.exec(edge)![1];
    expect(ids).toContain(src);
    expect(ids).toContain(tgt);
    expect(edge).toContain("startArrow=ERmany");
    expect(edge).toContain("endArrow=ERone");
    expect(edge).toContain('value=""');
    // the label is a floating text cell, not a native edge label
    expect(/<mxCell id="c\d+" parent="1" style="text;[^"]*" value="places" vertex="1"/.test(xml)).toBe(true);
    expect(xml).toContain("users &amp;lt;x&amp;gt;");
    expect(edge).toContain("exitX=0");
    expect(edge).toContain("entryX=1");
  });
  it("tints like color-mix with white", () => {
    expect(tint("#000000", 10)).toBe("#e6e6e6");
  });
});
