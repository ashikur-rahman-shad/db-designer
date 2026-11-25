"use client";
import { useState } from "react";
import type { DesignData, DesignMeta } from "@/domain/types";
import { parseAnyImport } from "@/lib/json";
import { Button } from "../atoms/Button";
import { TextArea } from "../atoms/TextArea";
import { Modal } from "../molecules/Modal";

export interface ImportPayload { meta: Partial<DesignMeta>; data: DesignData; source: "sql" | "json" }

export function ImportModal({
  onClose, onImport, replacing,
}: { onClose: () => void; onImport: (p: ImportPayload) => void; replacing?: boolean }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const run = () => {
    try {
      const r = parseAnyImport(text, fileName);
      if (r.data.tables.length === 0) { setError("Nothing to import: no tables were found."); setWarnings(r.warnings); return; }
      onImport({ meta: r.meta, data: r.data, source: r.source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal
      title="Import SQL or JSON" onClose={onClose} width="max-w-2xl"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!text.trim()} onClick={run}>{replacing ? "Replace design" : "Import"}</Button></>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Paste ANSI SQL (<code>CREATE TABLE</code>, <code>ALTER TABLE … FOREIGN KEY</code>) or a DB Designer JSON file.
          SQL that uses the designer’s comment tags restores groups, descriptions and colors automatically.
        </p>
        <input
          type="file" accept=".sql,.json,.txt"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            setText(await f.text());
            setError("");
          }}
          className="block text-sm"
        />
        <TextArea rows={14} value={text} onChange={(e) => { setText(e.target.value); setError(""); }} className="mono !text-xs" placeholder="CREATE TABLE users (...);" />
        {replacing && <p className="text-xs font-medium text-amber-600">This replaces the current design’s tables and relationships.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
      </div>
    </Modal>
  );
}
