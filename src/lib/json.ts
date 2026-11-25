import { normalizeDesignData } from "@/domain/factory";
import { tableLayout } from "@/domain/layout";
import { routeRelationship, tableBoxes } from "@/domain/routing";
import { parseSql } from "./sql/import";
import type { DesignData, DesignMeta } from "@/domain/types";

export const JSON_FORMAT = "dbdesigner";
export const JSON_VERSION = 1;

/**
 * Full-fidelity export: tables (with position and size), columns, groups,
 * relationships including the computed line route (corner points, sides) and
 * annotation, plus rendering settings.
 */
export function exportJson(meta: DesignMeta, data: DesignData): string {
  const boxes = tableBoxes(data);
  const out = {
    format: JSON_FORMAT,
    version: JSON_VERSION,
    design: { ...meta },
    settings: data.settings,
    tableGroups: data.tableGroups,
    tables: data.tables.map((t) => {
      const l = tableLayout(data, t);
      return { ...t, width: l.width, height: l.height };
    }),
    relationships: data.relationships.map((r) => {
      const route = routeRelationship(r, data, boxes);
      return {
        ...r,
        route: route && {
          fromSide: route.fromSide,
          toSide: route.toSide,
          points: route.points,
          cornerRadius: data.settings.cornerRadius,
        },
      };
    }),
  };
  return JSON.stringify(out, null, 2);
}

export function parseJson(text: string): { meta: Partial<DesignMeta>; data: DesignData } {
  const raw = JSON.parse(text);
  if (raw?.format !== JSON_FORMAT) throw new Error("Not a DB Designer JSON file (missing format marker).");
  const meta: Partial<DesignMeta> = {
    name: raw.design?.name,
    shortDescription: raw.design?.shortDescription,
    longDescription: raw.design?.longDescription,
  };
  // `height` (tables) and `route` (relationships) are computed on export; they are dropped here, never stored.
  const tables = Array.isArray(raw.tables) ? raw.tables.map(({ height: _h, ...t }: Record<string, unknown>) => t) : raw.tables;
  const relationships = Array.isArray(raw.relationships) ? raw.relationships.map(({ route: _r, ...r }: Record<string, unknown>) => r) : raw.relationships;
  return { meta, data: normalizeDesignData({ tableGroups: raw.tableGroups, tables, relationships, settings: raw.settings }) };
}

export function parseAnyImport(
  text: string,
  fileName = "",
): { meta: Partial<DesignMeta>; data: DesignData; warnings: string[]; source: "sql" | "json" } {
  const trimmed = text.trim();
  if (fileName.endsWith(".json") || trimmed.startsWith("{")) return { ...parseJson(text), warnings: [], source: "json" };
  return { ...parseSql(text), source: "sql" };
}
