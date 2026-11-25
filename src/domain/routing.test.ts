import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newRelationship, newTable } from "./factory";
import { labelReadDirection, labelShape, labelSize, loopDrag, roundedPath, routeRelationship, tableBoxes } from "./routing";
import type { DesignData } from "./types";

function setup(ax: number, ay: number, bx: number, by: number, bend = 0) {
  const pk = newColumn({ name: "id", primaryKey: true });
  const fk = newColumn({ name: "a_id" });
  const parent = newTable({ x: bx, y: by, items: [pk] });
  const child = newTable({ x: ax, y: ay, items: [newColumn({ name: "id" }), fk] });
  const rel = newRelationship({ fromTableId: child.id, fromColumnId: fk.id, toTableId: parent.id, toColumnId: pk.id, bend });
  const data: DesignData = { tableGroups: [], tables: [child, parent], relationships: [rel], settings: { ...DEFAULT_SETTINGS } };
  return { data, rel };
}

const cases: [string, number[]][] = [
  ["child left of parent", [0, 0, 400, 130]],
  ["child right of parent", [500, 40, 0, 200]],
  ["overlapping horizontally", [0, 0, 60, 300]],
  ["bent", [0, 0, 400, 130, 3]],
  ["same row", [0, 0, 400, 0]],
];

describe("routeRelationship", () => {
  it.each(cases)("%s: orthogonal and on the grid", (_n, [ax, ay, bx, by, bend]) => {
    const { data, rel } = setup(ax, ay, bx, by, bend ?? 0);
    const route = routeRelationship(rel, data)!;
    expect(route.points.length).toBeGreaterThanOrEqual(2);
    route.points.forEach((p) => { expect(p.x % 10).toBe(0); expect(p.y % 10).toBe(0); });
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it("rounds corners with arcs only", () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 10);
    expect(d).toContain("A 10 10");
  });
});

describe("label placement: never hidden under a table", () => {
  const overlaps = (p: { x: number; y: number }, label: string, boxes: { x: number; y: number; w: number; h: number }[]) => {
    const { w, h } = labelSize(label);
    return boxes.some((t) => p.x + w / 2 > t.x && p.x - w / 2 < t.x + t.w && p.y + h / 2 > t.y && p.y - h / 2 < t.y + t.h);
  };

  it("stays at its default spot when nothing covers it", () => {
    const { data, rel } = setup(0, 0, 400, 130);
    rel.label = "places";
    const r = routeRelationship(rel, data)!;
    expect(r.labelAt).toEqual({ x: r.mid.a.x, y: Math.round((r.points[0].y + r.points[r.points.length - 1].y) / 2 / 10) * 10 });
  });

  it("moves along the line when a table is dragged over the default spot", () => {
    const { data, rel } = setup(0, 0, 400, 130);
    rel.label = "places";
    const free = routeRelationship(rel, data)!.labelAt;
    // a third table sitting exactly on the default label spot
    const blocker = newTable({ x: free.x - 60, y: free.y - 30, items: [newColumn({ name: "x" })] });
    data.tables.push(blocker);
    const r = routeRelationship(rel, data)!;
    expect(r.labelAt).not.toEqual(free);
    const boxes = tableBoxes(data);
    expect(overlaps(r.labelAt, "places", [...boxes.values()])).toBe(false);
    // and it is still on the line (on one of its segments), on the grid
    expect(r.labelAt.x % 10).toBe(0);
    expect(r.labelAt.y % 10).toBe(0);
    const onLine = r.points.slice(1).some((b, i) => {
      const a = r.points[i];
      return r.labelAt.x >= Math.min(a.x, b.x) && r.labelAt.x <= Math.max(a.x, b.x) && r.labelAt.y >= Math.min(a.y, b.y) && r.labelAt.y <= Math.max(a.y, b.y);
    });
    expect(onLine).toBe(true);
  });

  it("falls back to the default spot when the whole line is covered", () => {
    const { data, rel } = setup(0, 0, 400, 130);
    rel.label = "places";
    const free = routeRelationship(rel, data)!.labelAt;
    data.tables.push(newTable({ x: -100, y: -100, width: 1000, autoWidth: false, items: Array.from({ length: 30 }, () => newColumn({})) }));
    expect(routeRelationship(rel, data)!.labelAt).toEqual(free);
  });
});

import { nearestFraction, nearestPlacement, placementPoint, pointAtFraction, polylineLength } from "./routing";
import { normalizeDesignData } from "./factory";

describe("label position on the line", () => {
  // an S-shaped orthogonal line: 100 right, 50 down, 100 right (total length 250)
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 50 }];

  it("pointAtFraction walks the line by length", () => {
    expect(pointAtFraction(line, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(line, 1)).toEqual({ x: 200, y: 50 });
    expect(pointAtFraction(line, 0.5)).toEqual({ x: 100, y: 25 }); // half way = middle of the vertical run
    expect(pointAtFraction(line, 0.2)).toEqual({ x: 50, y: 0 });
    expect(pointAtFraction(line, -5)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(line, 7)).toEqual({ x: 200, y: 50 });
  });

  it("nearestFraction projects ANY pointer position onto the line and snaps to the grid", () => {
    // pointer far above / beside the line still lands on it
    const f = nearestFraction(line, { x: 53, y: -80 });
    const p = pointAtFraction(line, f);
    expect(p).toEqual({ x: 50, y: 0 });
    expect(nearestFraction(line, { x: 400, y: 400 })).toBe(1);
    expect(nearestFraction(line, { x: -400, y: -400 })).toBe(0);
    // on the vertical run: the point keeps x=100 and snaps y to the grid
    const q = pointAtFraction(line, nearestFraction(line, { x: 108, y: 33 }));
    expect(q.x).toBe(100);
    expect(q.y % 10).toBe(0);
  });

  it("every result lies on the line and on the grid (random pointers)", () => {
    for (let i = 0; i < 200; i++) {
      const pt = { x: Math.random() * 300 - 50, y: Math.random() * 200 - 70 };
      const p = pointAtFraction(line, nearestFraction(line, pt));
      expect(p.x % 10 === 0 && p.y % 10 === 0).toBe(true);
      const onLine = line.slice(1).some((b, k) => {
        const a = line[k];
        return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
      });
      expect(onLine).toBe(true);
    }
  });

  it("placements are measured from the nearer end of the line", () => {
    // 250 long: 100 right, 50 down, 100 right
    expect(nearestPlacement(line, { x: 20, y: 0 })).toEqual({ from: "start", distance: 20 });
    expect(nearestPlacement(line, { x: 190, y: 50 })).toEqual({ from: "end", distance: 10 });
    expect(placementPoint(line, { from: "start", distance: 20 })).toEqual({ x: 20, y: 0 });
    expect(placementPoint(line, { from: "end", distance: 10 })).toEqual({ x: 190, y: 50 });
    // distances beyond the line are clamped onto it
    expect(placementPoint(line, { from: "start", distance: 9999 })).toEqual({ x: 200, y: 50 });
    expect(placementPoint(line, { from: "end", distance: -5 })).toEqual({ x: 200, y: 50 });
    // round trip for random pointers: always on the line and on the grid
    for (let i = 0; i < 100; i++) {
      const pt = { x: Math.random() * 300 - 50, y: Math.random() * 200 - 70 };
      const q = placementPoint(line, nearestPlacement(line, pt));
      expect(q).toEqual(pointAtFraction(line, nearestFraction(line, pt)));
      expect(q.x % 10 === 0 && q.y % 10 === 0).toBe(true);
    }
  });

  it("a manual placement is honoured exactly and stays next to its end when the line changes length", () => {
    const { data, rel } = setup(0, 0, 400, 130);
    rel.label = "places";
    const auto = routeRelationship(rel, data)!;
    rel.labelPos = { from: "end", distance: 30 };
    const manual = routeRelationship(rel, data)!;
    expect(manual.labelAt).toEqual(placementPoint(manual.points, { from: "end", distance: 30 }));
    expect(manual.labelAt).not.toEqual(auto.labelAt);
    const last = manual.points[manual.points.length - 1];
    // 30 px from the end of the line, measured along it
    const distToEnd = (r: typeof manual) => {
      const pts = [...r.points]; let d = 0;
      for (let i = pts.length - 1; i > 0; i--) {
        const a = pts[i], b = pts[i - 1], at = r.labelAt;
        const onSeg = at.x >= Math.min(a.x, b.x) && at.x <= Math.max(a.x, b.x) && at.y >= Math.min(a.y, b.y) && at.y <= Math.max(a.y, b.y);
        if (onSeg) return d + Math.hypot(at.x - a.x, at.y - a.y);
        d += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return NaN;
    };
    expect(distToEnd(manual)).toBe(30);
    // the parent table moves far away -> the line is much longer, the label is STILL 30 px from that end
    data.tables[1].x += 500; data.tables[1].y += 300;
    const longer = routeRelationship(rel, data)!;
    expect(polylineLength(longer.points)).toBeGreaterThan(polylineLength(manual.points) + 300);
    expect(distToEnd(longer)).toBe(30);
    rel.labelPos = null;
    expect(routeRelationship(rel, data)!.labelAt).not.toEqual(longer.labelAt);
    expect(last).toBeTruthy();
  });

  it("labelPos is validated when loading a design", () => {
    const base = { fromTableId: "a", fromColumnId: "b", toTableId: "c", toColumnId: "d" };
    const rels = normalizeDesignData({
      relationships: [
        { ...base, labelPos: { from: "end", distance: 40 } },
        { ...base, labelPos: { from: "start", distance: -9 } },
        { ...base, labelPos: { from: "middle", distance: 5 } },
        { ...base, labelPos: { from: "start", distance: "x" } },
        { ...base, labelPos: 0.4 },
        base,
      ] as never,
    }).relationships;
    expect(rels.map((r) => r.labelPos)).toEqual([{ from: "end", distance: 40 }, { from: "start", distance: 0 }, null, null, null, null]);
  });

  it("loops around the right by default and the left when loopSide is left", () => {
    const { data, rel } = setup(0, 0, 60, 300);
    const right = routeRelationship(rel, data)!;
    expect([right.fromSide, right.toSide]).toEqual(["right", "right"]);
    const left = routeRelationship({ ...rel, loopSide: "left" }, data)!;
    expect([left.fromSide, left.toSide]).toEqual(["left", "left"]);
    const minX = Math.min(...data.tables.map((t) => t.x));
    expect(left.mid.a.x).toBeLessThan(minX);
    left.points.forEach((p) => { expect(Math.abs(p.x % 10)).toBe(0); expect(Math.abs(p.y % 10)).toBe(0); });
  });

  it("flips a C shaped line when the run is dragged past the centre, and the run follows the cursor", () => {
    const { data, rel } = setup(0, 0, 60, 300);
    const boxes = tableBoxes(data);
    const far = loopDrag(rel, data, boxes, 1000)!;
    expect(far.loopSide).toBe("right");
    const flipped = loopDrag(rel, data, boxes, -50)!;
    expect(flipped.loopSide).toBe("left");
    const route = routeRelationship({ ...rel, ...flipped }, data)!;
    expect(route.mid.a.x).toBe(-50);
    const back = routeRelationship({ ...rel, ...far }, data)!;
    expect(back.mid.a.x).toBe(1000);
  });

  it("side-by-side tables ignore loopSide (the automatic left/right join stays)", () => {
    const { data, rel } = setup(0, 0, 600, 130);
    const r = routeRelationship({ ...rel, loopSide: "left" }, data)!;
    expect([r.fromSide, r.toSide]).toEqual(["right", "left"]);
  });

  it("points the label from the parent to the child by default, and reverses on request", () => {
    // The foreign key sits in the child's 2nd row, the parent key in the parent's 1st: the line rises from child to parent.
    const { data, rel } = setup(0, 0, 600, 0);
    expect(routeRelationship(rel, data)!.labelDir).toEqual({ x: 0, y: 1 }); // parent -> child = downwards
    expect(routeRelationship({ ...rel, labelDirection: "child-to-parent" }, data)!.labelDir).toEqual({ x: 0, y: -1 });
  });

  it("points along a vertical run too", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }];
    expect(labelReadDirection(pts, { x: 100, y: 100 }, undefined)).toEqual({ x: 0, y: -1 });
    expect(labelReadDirection(pts, { x: 100, y: 100 }, "child-to-parent")).toEqual({ x: 0, y: 1 });
  });

  it("builds a pennant for horizontal reading, however long the label", () => {
    for (const label of ["a", "linked individual", "a rather long relationship label that spans wide"]) {
      const { w, h } = labelSize(label);
      const right = labelShape(w, h, { x: 1, y: 0 }).points.split(" ");
      expect(right).toContain(`${w / 2},0`); // tip on the right
      expect(right).toContain(`${-w / 2},-9`); // flat left side
      expect(labelShape(w, h, { x: -1, y: 0 }).points.split(" ")).toContain(`${-w / 2},0`);
    }
  });

  it("uses a plain rectangle with a small arrow head in the middle for vertical reading", () => {
    const { w, h } = labelSize("trades with");
    const down = labelShape(w, h, { x: 0, y: 1 }).points.split(" ");
    expect(down).toContain("0,16"); // arrow tip below the box (h / 2 + 7)
    expect(down).toContain("-7,9");
    expect(labelShape(w, h, { x: 0, y: -1 }).points.split(" ")).toContain("0,-16");
  });

  it("gives the label shape rounded corners", () => {
    const { w, h } = labelSize("owns");
    for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const { path } = labelShape(w, h, dir);
      expect(path.startsWith("M ")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
      expect(path).toContain("Q ");
      expect(path).not.toContain("NaN");
    }
  });

  it("takes the label direction from the design setting unless the relationship overrides it", () => {
    const { data, rel } = setup(0, 0, 600, 0);
    const base = routeRelationship(rel, data)!.labelDir;
    const flippedDesign = { ...data, settings: { ...data.settings, labelDirection: "child-to-parent" as const } };
    const f = routeRelationship(rel, flippedDesign)!.labelDir;
    expect(f).toEqual({ x: -base.x || 0, y: -base.y || 0 });
    expect(routeRelationship({ ...rel, labelDirection: "parent-to-child" }, flippedDesign)!.labelDir).toEqual(base);
  });
});
