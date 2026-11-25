import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbd-dup-"));
process.env.DB_PATH = path.join(dir, "t.db");

describe("duplicate", async () => {
  const { designRepository } = await import("./designRepository");
  const { versionRepository } = await import("./versionRepository");
  const { newTable } = await import("@/domain/factory");
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("copies the latest state independently, with a unique name and no versions", () => {
    const a = designRepository.create({ name: "Shop", shortDescription: "s", longDescription: "l" });
    designRepository.update(a.id, { data: { ...a.data, tables: [newTable({ name: "t1" })] } });
    versionRepository.create(a.id, "v");

    const c1 = designRepository.duplicate(a.id)!;
    const c2 = designRepository.duplicate(a.id)!;
    expect([c1.name, c2.name]).toEqual(["Shop (copy)", "Shop (copy 2)"]);
    expect(c1.id).not.toBe(a.id);
    expect(c1.shortDescription).toBe("s");
    expect(c1.data.tables.map((t) => t.name)).toEqual(["t1"]);
    expect(versionRepository.list(c1.id)).toHaveLength(0);
    expect(versionRepository.list(a.id)).toHaveLength(1);

    designRepository.update(c1.id, { data: { ...c1.data, tables: [] } }); // editing the copy leaves the original alone
    expect(designRepository.get(a.id)!.data.tables).toHaveLength(1);
    expect(designRepository.duplicate("nope")).toBeNull();
  });
});
