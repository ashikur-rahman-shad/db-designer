import type { DesignSettings } from "./types";

/**
 * View options are a *user* preference (remembered in the database for every diagram), as opposed to
 * the per-design rendering settings (corner radius, line color, ...).
 */
export const VIEW_SETTING_KEYS = ["viewMode", "showGrid", "showLabels", "showMarkers", "showAttributes", "showDescriptions", "hideGroups"] as const;
export type ViewSettingKey = (typeof VIEW_SETTING_KEYS)[number];

export type ViewOptions = Pick<DesignSettings, ViewSettingKey> & {
  /** Whether the Properties panel is visible. */
  panelOpen: boolean;
  /** How many editing steps can be undone (0 = undo / redo off). */
  undoLimit: number;
};

export const DEFAULT_UNDO_LIMIT = 50;
export const MAX_UNDO_LIMIT = 500;

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  viewMode: "full",
  showGrid: true,
  showLabels: true,
  showMarkers: true,
  showAttributes: true,
  showDescriptions: true,
  hideGroups: false,
  panelOpen: true,
  undoLimit: DEFAULT_UNDO_LIMIT,
};

/** Merge unknown input over `base`, keeping only valid values of the right type. */
export function normalizeViewOptions(raw: unknown, base: ViewOptions = DEFAULT_VIEW_OPTIONS): ViewOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof ViewOptions) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (base[k] as boolean));
  return {
    viewMode: r.viewMode === "logical" || r.viewMode === "full" ? r.viewMode : base.viewMode,
    showGrid: bool("showGrid"),
    showLabels: bool("showLabels"),
    showMarkers: bool("showMarkers"),
    showAttributes: bool("showAttributes"),
    showDescriptions: bool("showDescriptions"),
    hideGroups: bool("hideGroups"),
    panelOpen: bool("panelOpen"),
    undoLimit: typeof r.undoLimit === "number" && Number.isFinite(r.undoLimit) ? Math.min(MAX_UNDO_LIMIT, Math.max(0, Math.round(r.undoLimit))) : base.undoLimit,
  };
}

export const pickViewSettings = (s: Partial<DesignSettings>): Partial<Pick<DesignSettings, ViewSettingKey>> =>
  Object.fromEntries(VIEW_SETTING_KEYS.filter((k) => k in s).map((k) => [k, s[k]])) as Partial<Pick<DesignSettings, ViewSettingKey>>;

export const sameViewOptions = (a: ViewOptions, b: ViewOptions) =>
  a.panelOpen === b.panelOpen && a.undoLimit === b.undoLimit && VIEW_SETTING_KEYS.every((k) => a[k] === b[k]);
