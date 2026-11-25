import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbd-vo-"));
process.env.DB_PATH = path.join(dir, "t.db");

describe("remembered view options (database)", async () => {
  const { settingsRepository } = await import("./settingsRepository");
  const { designRepository } = await import("./designRepository");
  const { versionRepository } = await import("./versionRepository");
  const { newTable, newColumn, newGroup } = await import("@/domain/factory");
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("null until set; merges patches; ignores junk; survives a new connection's read", () => {
    expect(settingsRepository.getViewOptions()).toBeNull();
    const a = settingsRepository.setViewOptions({ showGrid: false });
    expect(a).toMatchObject({ showGrid: false, viewMode: "full", panelOpen: true });
    settingsRepository.setViewOptions({ viewMode: "logical", panelOpen: false, showLabels: "yes", bogus: 1 });
    expect(settingsRepository.getViewOptions()).toEqual({
      viewMode: "logical", showGrid: false, showLabels: true, showMarkers: true, showAttributes: true, showDescriptions: true, hideGroups: false, panelOpen: false, undoLimit: 50,
    });
  });

  it("view options and collapsed groups do not count as a modification of a version", () => {
    const d = designRepository.create({ name: "D" });
    const g = newGroup({ name: "G", columns: [newColumn({ name: "a" })] });
    designRepository.update(d.id, { data: { ...d.data, tables: [newTable({ name: "t", items: [g] })] } });
    versionRepository.create(d.id);
    expect(versionRepository.info(d.id).changedSinceVersion).toBe(false);

    const cur = designRepository.get(d.id)!;
    cur.data.settings.showGrid = false;
    cur.data.settings.viewMode = "logical";
    (cur.data.tables[0].items[0] as ReturnType<typeof newGroup>).collapsed = true;
    designRepository.update(d.id, { data: cur.data });
    expect(versionRepository.info(d.id).changedSinceVersion).toBe(false);

    cur.data.tables[0].name = "renamed";
    designRepository.update(d.id, { data: cur.data });
    expect(versionRepository.info(d.id).changedSinceVersion).toBe(true);
  });

  it("a long-lived connection created before app_settings existed upgrades itself", async () => {
    const { getDb } = await import("./db");
    getDb().exec("DROP TABLE app_settings");
    (globalThis as unknown as { __dbdSchema?: number }).__dbdSchema = 1; // simulate the old schema version
    expect(settingsRepository.getViewOptions()).toBeNull(); // table is recreated instead of throwing
    expect(settingsRepository.setViewOptions({ showGrid: false }).showGrid).toBe(false);
  });
});
