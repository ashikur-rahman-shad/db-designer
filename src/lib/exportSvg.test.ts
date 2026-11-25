import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newRelationship, newTable } from "@/domain/factory";
import type { DesignData } from "@/domain/types";
import { buildSvg } from "./exportSvg";

function design(): DesignData {
  const pk = newColumn({ name: "id", primaryKey: true, dataType: "int" });
  const fk = newColumn({ name: "owner_id", dataType: "int", description: "Who <owns> this & more", enumValues: "a,b" });
  const parent = newTable({ name: "owner", x: 400, y: 100, items: [pk] });
  const child = newTable({ name: "item", x: 0, y: 0, items: [newColumn({ name: "id", primaryKey: true }), fk] });
  const rel = newRelationship({ fromTableId: child.id, fromColumnId: fk.id, toTableId: parent.id, toColumnId: pk.id, label: "owns" });
  return { tableGroups: [], tables: [child, parent], relationships: [rel], settings: { ...DEFAULT_SETTINGS } };
}

describe("buildSvg", () => {
  it("returns null for an empty design", () => {
    expect(buildSvg({ ...design(), tables: [], relationships: [] })).toBeNull();
  });
  it("is native SVG that importers can read", () => {
    const svg = buildSvg(design())!;
    expect(svg).not.toMatch(/foreignObject|<style|@font-face|data:|xhtml/);
    expect(svg).toContain("owner_id");
    expect(svg).toContain("Who &lt;owns&gt; this &amp; more");
    expect(svg).toContain(">owns<");
  });
});
