import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_OPTIONS, normalizeViewOptions } from "./viewOptions";

describe("view options", () => {
  it("hideGroups defaults to false, is validated and kept", () => {
    expect(DEFAULT_VIEW_OPTIONS.hideGroups).toBe(false);
    expect(normalizeViewOptions({ hideGroups: true }).hideGroups).toBe(true);
    expect(normalizeViewOptions({ hideGroups: "yes" }).hideGroups).toBe(false);
    // options saved before hideGroups existed still load
    expect(normalizeViewOptions({ viewMode: "logical", showGrid: false }).hideGroups).toBe(false);
  });
});
