import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbd-"));
process.env.DB_PATH = path.join(dir, "t.db");

describe("versions", async () => {
  const { designRepository } = await import("./designRepository");
  const { versionRepository } = await import("./versionRepository");
  const { newTable } = await import("@/domain/factory");
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("increments per design, snapshots are immutable, restore copies back", () => {
    const a = designRepository.create({ name: "A" });
    const b = designRepository.create({ name: "B" });
    expect(versionRepository.info(a.id)).toMatchObject({ latest: 0 });

    const data1 = { ...a.data, tables: [newTable({ name: "t1" })] };
    designRepository.update(a.id, { data: data1 });
    expect(versionRepository.create(a.id, "first")!.version).toBe(1);
    expect(versionRepository.info(a.id).changedSinceVersion).toBe(false);

    designRepository.update(a.id, { name: "A2", data: { ...a.data, tables: [newTable({ name: "t1" }), newTable({ name: "t2" })] } });
    expect(versionRepository.info(a.id).changedSinceVersion).toBe(true);
    expect(versionRepository.create(a.id)!.version).toBe(2);
    expect(versionRepository.create(b.id)!.version).toBe(1); // independent numbering

    const list = versionRepository.list(a.id);
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[1]).toMatchObject({ note: "first", tableCount: 1, name: "A" });

    const restored = versionRepository.restore(a.id, 1)!;
    expect(restored.name).toBe("A");
    expect(restored.data.tables).toHaveLength(1);
    expect(versionRepository.list(a.id)).toHaveLength(2); // restore adds no version
    expect(versionRepository.get(a.id, 2)!.data.tables).toHaveLength(2);

    designRepository.delete(a.id);
    expect(versionRepository.list(a.id)).toHaveLength(0); // cascade
  });
});
