"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DesignVersionSummary } from "@/domain/types";
import { downloadText, safeFileName } from "@/lib/download";
import { fetchVersion, listVersions, restoreVersion, saveNow } from "@/lib/designApi";
import { exportSql } from "@/lib/sql/export";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { Modal } from "../molecules/Modal";

export function VersionHistoryModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const info = useEditor((s) => s.versionInfo);
  const viewing = useEditor((s) => s.viewing);
  const [versions, setVersions] = useState<DesignVersionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    listVersions().then(setVersions).catch((e) => setError(String(e.message ?? e)));
  }, []);

  const restore = async (v: DesignVersionSummary) => {
    const warn = info.changedSinceVersion ? "\n\nYour current changes are newer than the latest saved version and will be replaced (save a version first to keep them)." : "";
    if (!confirm(`Restore version ${v.version}? It becomes the current state; version history is kept.${warn}`)) return;
    setBusy(v.version);
    try {
      const { design, versionInfo } = await restoreVersion(v.version);
      if (viewing) {
        router.push(`/designs/${design.id}`); // leave the read-only view; the server renders the restored latest state
      } else {
        useEditor.getState().load(design, versionInfo);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  /** Open a version in the designer (read-only). Pending edits are flushed first so none are lost. */
  const view = async (v: DesignVersionSummary) => {
    setBusy(v.version);
    if (!viewing && !(await saveNow())) {
      setError("Could not save your latest changes, so the version was not opened.");
      setBusy(null);
      return;
    }
    router.push(`/designs/${useEditor.getState().id}?version=${v.version}`);
    onClose();
  };

  const downloadSql = async (v: DesignVersionSummary) => {
    const full = await fetchVersion(v.version);
    downloadText(`${safeFileName(full.name)}_v${v.version}.sql`, exportSql(full, full.data, {}, { stamp: { version: v.version, updatedAt: v.createdAt } }), "application/sql");
  };

  return (
    <Modal title="Version history" onClose={onClose} width="max-w-2xl" footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {info.changedSinceVersion && (
        <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          The current design has changes that are not in a saved version{info.latest ? ` (latest is v${info.latest})` : ""}.
        </p>
      )}
      {!versions ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="text-sm italic text-slate-400">No versions yet. Use “Save version” to create the first one.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {versions.map((v) => (
            <li key={v.version} className="flex items-start gap-3 p-3">
              <span className="mt-0.5 rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">v{v.version}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {new Date(v.createdAt).toLocaleString()}
                  {v.version === info.latest && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">latest</span>}
                  {viewing?.version === v.version && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">viewing</span>}
                </p>
                {v.note && <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{v.note}</p>}
                <p className="text-xs text-slate-400">{v.name} · {v.tableCount} table{v.tableCount === 1 ? "" : "s"}</p>
              </div>
              <Button size="sm" variant="primary" disabled={busy !== null || viewing?.version === v.version} onClick={() => view(v)}>View</Button>
              <Button size="sm" onClick={() => downloadSql(v)}>SQL</Button>
              <Button size="sm" disabled={busy !== null} onClick={() => restore(v)}>{busy === v.version ? "Restoring…" : "Restore"}</Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
