"use client";
import { useMemo, useState } from "react";
import { useDesignStamp } from "@/lib/designStamp";
import { downloadText, safeFileName } from "@/lib/download";
import { ALL_EXPORT_OPTIONS, DEFAULT_EXPORT_OPTIONS, PLAIN_EXPORT_OPTIONS, SQL_DIALECTS, exportSql, type SqlDialect, type SqlExportOptions } from "@/lib/sql/export";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { Checkbox } from "../atoms/Checkbox";
import { SelectInput } from "../atoms/SelectInput";
import { Modal } from "../molecules/Modal";

// v2: the dialog got new first-time defaults (see DEFAULT_EXPORT_OPTIONS); older remembered choices are not carried over.
const STORAGE_KEY = "dbd.exportSql.v2";

/** Export choices are remembered in this browser (storage failures are ignored). */
function loadOptions(): SqlExportOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SqlExportOptions> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_EXPORT_OPTIONS;
    const out = { ...DEFAULT_EXPORT_OPTIONS };
    for (const k of Object.keys(out) as (keyof SqlExportOptions)[]) {
      if (k === "dialect") { if (SQL_DIALECTS.some((d) => d.value === raw.dialect)) out.dialect = raw.dialect as SqlDialect; }
      else if (typeof raw[k] === "boolean") (out as Record<string, unknown>)[k] = raw[k];
    }
    return out;
  } catch { return DEFAULT_EXPORT_OPTIONS; }
}

type BoolKey = Exclude<keyof SqlExportOptions, "dialect">;
const CONTENT: { key: BoolKey; label: string; hint?: string }[] = [
  { key: "indexes", label: "Indexes (incl. unique / composite)" },
  { key: "foreignKeys", label: "Foreign keys" },
  { key: "enumValues", label: "Enum values (ENUM / CHECK ... IN)" },
];
const DESIGN: { key: BoolKey; label: string; hint?: string }[] = [
  { key: "designInfo", label: "Design name & description" },
  { key: "tableDescriptions", label: "Table descriptions" },
  { key: "columnDescriptions", label: "Column descriptions" },
  { key: "colors", label: "Table colors" },
  { key: "groups", label: "Column groups & table groups" },
  { key: "logicalFlags", label: "Logical-view flags" },
  { key: "relationshipLabels", label: "Relationship annotations" },
];

/** Exports the whole design, or just `tableId` (that table, its indexes and the foreign keys it holds). */
export function ExportSqlModal({ onClose, tableId }: { onClose: () => void; tableId?: string }) {
  const meta = useEditor((s) => s.meta);
  const data = useEditor((s) => s.data);
  const [opts, setOpts] = useState<SqlExportOptions>(loadOptions);
  const stamp = useDesignStamp();
  const single = tableId ? data.tables.find((t) => t.id === tableId) : undefined;
  const sql = useMemo(
    () => exportSql(meta, data, opts, { stamp: { version: stamp.version, updatedAt: stamp.updatedAt }, onlyTableId: single?.id }),
    [meta, data, opts, stamp, single],
  );
  const [copied, setCopied] = useState(false);
  const dialect = SQL_DIALECTS.find((d) => d.value === opts.dialect)!;

  const change = (patch: Partial<SqlExportOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    setCopied(false);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode etc. */ }
  };
  const box = ({ key, label }: { key: BoolKey; label: string }) => (
    <Checkbox key={key} label={label} checked={opts[key]} onChange={(e) => change({ [key]: e.target.checked })} />
  );
  const anyDesc = opts.tableDescriptions || opts.columnDescriptions;

  return (
    <Modal
      title={single ? `Export SQL: ${single.name}` : "Export SQL"} onClose={onClose} width="max-w-4xl"
      footer={
        <>
          <Button onClick={async () => { await navigator.clipboard.writeText(sql); setCopied(true); }}>{copied ? "Copied ✓" : "Copy"}</Button>
          <Button variant="primary" onClick={() => downloadText(`${safeFileName(single ? single.name : meta.name)}.sql`, sql, "application/sql")}>Download .sql</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="sql-dialect">Database</label>
            <SelectInput id="sql-dialect" value={opts.dialect} onChange={(e) => change({ dialect: e.target.value as SqlDialect })}>
              {SQL_DIALECTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </SelectInput>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Schema</legend>
            {CONTENT.map(box)}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 flex w-full items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              Design information
              <span className="ml-auto flex gap-2 font-normal normal-case tracking-normal">
                <button type="button" className="text-blue-600 hover:underline" onClick={() => change({ ...DEFAULT_EXPORT_OPTIONS, dialect: opts.dialect })}>default</button>
                <button type="button" className="text-blue-600 hover:underline" onClick={() => change({ ...ALL_EXPORT_OPTIONS, dialect: opts.dialect, indexes: opts.indexes, foreignKeys: opts.foreignKeys, enumValues: opts.enumValues })}>all</button>
                <button type="button" className="text-blue-600 hover:underline" onClick={() => change({ ...PLAIN_EXPORT_OPTIONS, indexes: opts.indexes, foreignKeys: opts.foreignKeys, enumValues: opts.enumValues })}>none</button>
              </span>
            </legend>
            {DESIGN.map(box)}
            <Checkbox
              label={opts.dialect === "mysql" ? "Also as MySQL COMMENT" : "Also as COMMENT ON statements"}
              checked={opts.nativeComments && anyDesc}
              disabled={!anyDesc}
              onChange={(e) => change({ nativeComments: e.target.checked })}
            />
          </fieldset>
          <p className="text-xs text-slate-400">
            Descriptions are plain <code>--</code> comments (on the column's line for columns) and groups use <code>-- @group</code>; this tool imports them again. Turn it all off for a plain script.
          </p>
        </div>
        <pre aria-label={`${dialect.label} script`} className="mono scroll-thin max-h-[60vh] min-w-0 overflow-auto whitespace-pre rounded bg-slate-900 p-3 text-xs text-slate-100">{sql}</pre>
      </div>
    </Modal>
  );
}
