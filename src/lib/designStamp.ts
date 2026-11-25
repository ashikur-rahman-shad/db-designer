import { useMemo } from "react";
import { useEditor } from "@/store/editorStore";

/** Which version of the design a document (SQL, data dictionary) describes, and when it was last updated. */
export interface DesignStamp {
  /** Saved version number (0 = no version saved yet). */
  version: number;
  /** ISO time of the last update (for an old version: when that version was saved). */
  updatedAt: string;
  /** The design has edits that are newer than `version`. */
  modified: boolean;
}

/** `YYYY-MM-DD HH:mm` in the viewer's local time. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The stamp of what is open in the editor right now (an old version when one is being viewed). */
export function useDesignStamp(): DesignStamp {
  const viewing = useEditor((s) => s.viewing);
  const info = useEditor((s) => s.versionInfo);
  const updatedAt = useEditor((s) => s.updatedAt);
  return useMemo(
    () => (viewing ? { version: viewing.version, updatedAt: viewing.createdAt, modified: false } : { version: info.latest, updatedAt, modified: info.latest > 0 && info.changedSinceVersion }),
    [viewing, info.latest, info.changedSinceVersion, updatedAt],
  );
}
