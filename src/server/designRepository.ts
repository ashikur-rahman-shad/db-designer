import { randomUUID } from "node:crypto";
import { emptyDesignData, normalizeDesignData } from "@/domain/factory";
import type { Design, DesignData, DesignMeta, DesignSummary } from "@/domain/types";
import { getDb } from "./db";

interface Row {
  id: string;
  name: string;
  short_description: string;
  long_description: string;
  data: string;
  created_at: string;
  updated_at: string;
}

const toDesign = (r: Row): Design => ({
  id: r.id,
  name: r.name,
  shortDescription: r.short_description,
  longDescription: r.long_description,
  data: normalizeDesignData(JSON.parse(r.data)),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const designRepository = {
  list(): DesignSummary[] {
    const rows = getDb().prepare("SELECT * FROM designs ORDER BY updated_at DESC").all() as Row[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      shortDescription: r.short_description,
      longDescription: r.long_description,
      tableCount: (JSON.parse(r.data).tables ?? []).length,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  get(id: string): Design | null {
    const r = getDb().prepare("SELECT * FROM designs WHERE id = ?").get(id) as Row | undefined;
    return r ? toDesign(r) : null;
  },

  create(meta: Partial<DesignMeta> & { data?: DesignData }): Design {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb()
      .prepare("INSERT INTO designs VALUES (@id, @name, @short, @long, @data, @now, @now)")
      .run({
        id,
        name: meta.name?.trim() || "Untitled design",
        short: meta.shortDescription ?? "",
        long: meta.longDescription ?? "",
        data: JSON.stringify(meta.data ?? emptyDesignData()),
        now,
      });
    return this.get(id)!;
  },

  update(id: string, patch: Partial<DesignMeta> & { data?: DesignData }): Design | null {
    const cur = this.get(id);
    if (!cur) return null;
    getDb()
      .prepare(
        "UPDATE designs SET name=@name, short_description=@short, long_description=@long, data=@data, updated_at=@now WHERE id=@id",
      )
      .run({
        id,
        name: patch.name?.trim() || cur.name,
        short: patch.shortDescription ?? cur.shortDescription,
        long: patch.longDescription ?? cur.longDescription,
        data: JSON.stringify(patch.data ?? cur.data),
        now: new Date().toISOString(),
      });
    return this.get(id);
  },

  /** Copy a design's latest state under a unique "(copy)" name. Version history is not copied. */
  duplicate(id: string): Design | null {
    const src = this.get(id);
    if (!src) return null;
    const names = new Set((getDb().prepare("SELECT name FROM designs").all() as { name: string }[]).map((r) => r.name));
    let name = `${src.name} (copy)`;
    for (let n = 2; names.has(name); n++) name = `${src.name} (copy ${n})`;
    return this.create({
      name,
      shortDescription: src.shortDescription,
      longDescription: src.longDescription,
      data: structuredClone(src.data),
    });
  },

  delete(id: string): boolean {
    return getDb().prepare("DELETE FROM designs WHERE id = ?").run(id).changes > 0;
  },
};
