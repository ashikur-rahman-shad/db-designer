import { DEFAULT_VIEW_OPTIONS, normalizeViewOptions, type ViewOptions } from "@/domain/viewOptions";
import { getDb } from "./db";

const VIEW_KEY = "viewOptions";

export const settingsRepository = {
  /** The remembered view options, or null if the user never changed any (callers then seed their own). */
  getViewOptions(): ViewOptions | null {
    const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(VIEW_KEY) as { value: string } | undefined;
    if (!row) return null;
    try {
      return normalizeViewOptions(JSON.parse(row.value));
    } catch {
      return null;
    }
  },

  /** Merge `patch` into the stored view options (unknown / invalid fields are ignored). */
  setViewOptions(patch: unknown): ViewOptions {
    const base = this.getViewOptions() ?? DEFAULT_VIEW_OPTIONS;
    const next = normalizeViewOptions(patch, base);
    getDb()
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(VIEW_KEY, JSON.stringify(next), new Date().toISOString());
    return next;
  },
};
