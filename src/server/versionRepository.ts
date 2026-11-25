import { normalizeDesignData } from "@/domain/factory";
import { VIEW_SETTING_KEYS } from "@/domain/viewOptions";
import type { DesignData, DesignVersion, DesignVersionSummary, VersionInfo } from "@/domain/types";
import { getDb } from "./db";
import { designRepository } from "./designRepository";

interface Row {
  design_id: string;
  version: number;
  note: string;
  name: string;
  short_description: string;
  long_description: string;
  data: string;
  created_at: string;
}

const toSummary = (r: Row): DesignVersionSummary => ({
  version: r.version,
  note: r.note,
  name: r.name,
  tableCount: (JSON.parse(r.data).tables ?? []).length,
  createdAt: r.created_at,
});

const toVersion = (r: Row): DesignVersion => ({
  ...toSummary(r),
  designId: r.design_id,
  name: r.name,
  shortDescription: r.short_description,
  longDescription: r.long_description,
  data: normalizeDesignData(JSON.parse(r.data)),
});

/** Content that counts as an edit: view options and collapsed-group state are view-only and ignored. */
export function comparableContent(data: DesignData): string {
  const settings: Record<string, unknown> = { ...data.settings };
  for (const k of VIEW_SETTING_KEYS) delete settings[k];
  const tables = data.tables.map((t) => ({
    ...t,
    items: t.items.map((i) => (i.kind === "group" ? { ...i, collapsed: false } : i)),
  }));
  return JSON.stringify({ ...data, settings, tables });
}

export const versionRepository = {
  /** Newest first. */
  list(designId: string): DesignVersionSummary[] {
    const rows = getDb().prepare("SELECT * FROM design_versions WHERE design_id = ? ORDER BY version DESC").all(designId) as Row[];
    return rows.map(toSummary);
  },

  get(designId: string, version: number): DesignVersion | null {
    const r = getDb().prepare("SELECT * FROM design_versions WHERE design_id = ? AND version = ?").get(designId, version) as Row | undefined;
    return r ? toVersion(r) : null;
  },

  /** Snapshot the design's current (latest edit) state as the next version number. */
  create(designId: string, note = ""): DesignVersionSummary | null {
    const db = getDb();
    const run = db.transaction((): Row | null => {
      const d = designRepository.get(designId);
      if (!d) return null;
      const next = ((db.prepare("SELECT MAX(version) AS v FROM design_versions WHERE design_id = ?").get(designId) as { v: number | null }).v ?? 0) + 1;
      const created_at = new Date().toISOString();
      db.prepare(
        `INSERT INTO design_versions (design_id, version, note, name, short_description, long_description, data, created_at)
         VALUES (@designId, @version, @note, @name, @short, @long, @data, @created_at)`,
      ).run({
        designId, version: next, note: note.trim(), name: d.name,
        short: d.shortDescription, long: d.longDescription, data: JSON.stringify(d.data), created_at,
      });
      return { design_id: designId, version: next, note: note.trim(), name: d.name, short_description: d.shortDescription, long_description: d.longDescription, data: JSON.stringify(d.data), created_at };
    });
    const row = run();
    return row ? toSummary(row) : null;
  },

  /** Copy a version back into the latest edit state. Does not create a new version. */
  restore(designId: string, version: number) {
    const v = this.get(designId, version);
    if (!v) return null;
    return designRepository.update(designId, {
      name: v.name, shortDescription: v.shortDescription, longDescription: v.longDescription, data: v.data,
    });
  },

  info(designId: string): VersionInfo {
    const row = getDb()
      .prepare("SELECT version FROM design_versions WHERE design_id = ? ORDER BY version DESC LIMIT 1")
      .get(designId) as { version: number } | undefined;
    if (!row) return { latest: 0, changedSinceVersion: true };
    const d = designRepository.get(designId);
    const v = this.get(designId, row.version);
    if (!d || !v) return { latest: row.version, changedSinceVersion: true };
    const same =
      d.name === v.name && d.shortDescription === v.shortDescription && d.longDescription === v.longDescription &&
      comparableContent(d.data) === comparableContent(v.data);
    return { latest: row.version, changedSinceVersion: !same };
  },
};
