"use client";
import { useState } from "react";
import type { Column } from "@/domain/types";
import { Chip } from "../atoms/Chip";
import { IconButton } from "../atoms/IconButton";
import { SelectInput } from "../atoms/SelectInput";
import { TextArea } from "../atoms/TextArea";
import { TextInput } from "../atoms/TextInput";
import { Field } from "./Field";

export interface FkOption {
  tableId: string;
  tableName: string;
  /** All columns of the table; only primary-key / unique ones can be referenced by a foreign key. */
  columns: { id: string; name: string; pk: boolean; unique: boolean }[];
}

export interface ColumnEditorProps {
  column: Column;
  isFk: boolean;
  fkValue: string; // "tableId:columnId" or ""
  fkOptions: FkOption[];
  groupId: string; // "" for ungrouped
  groupOptions: { id: string; name: string }[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<Column>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onFkChange: (value: string) => void;
  onGroupChange: (groupId: string) => void;
  /** Drag-and-drop reordering: wired to the grip handle. */
  onHandleDragStart?: (e: React.DragEvent) => void;
  onHandleDragEnd?: () => void;
  /** Start with the details (description, default, FK, ...) expanded. */
  defaultOpen?: boolean;
}

const TYPES = [
  "INTEGER", "SMALLINT", "BIGINT", "DECIMAL(10, 2)", "NUMERIC(10, 2)", "REAL", "DOUBLE PRECISION",
  "BOOLEAN", "CHAR(1)", "VARCHAR(255)", "TEXT", "DATE", "TIME", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE",
  "UUID", "BLOB", "JSON",
];

export function ColumnEditor(p: ColumnEditorProps) {
  const [open, setOpen] = useState(!!p.defaultOpen);
  // Foreign key, step 1: reference table. Step 2: reference column (PK / unique columns of that table).
  const [pendingTable, setPendingTable] = useState("");
  const [fkTable, fkColumn] = p.fkValue ? p.fkValue.split(":") : [pendingTable, ""];
  const refTable = p.fkOptions.find((t) => t.tableId === fkTable);
  const candidates = (refTable?.columns ?? []).filter((col) => col.pk || col.unique || col.id === fkColumn);
  const pickTable = (tableId: string) => {
    setPendingTable(tableId);
    const t = p.fkOptions.find((x) => x.tableId === tableId);
    const only = t?.columns.filter((col) => col.pk || col.unique) ?? [];
    // One possible target (e.g. a single primary key): select it right away.
    p.onFkChange(tableId && only.length === 1 ? `${tableId}:${only[0].id}` : "");
  };
  const c = p.column;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-1.5">
      <div className="flex items-center gap-1">
        {p.onHandleDragStart && <span
          draggable
          onDragStart={p.onHandleDragStart}
          onDragEnd={p.onHandleDragEnd}
          title="Drag to reorder or move into / out of a group"
          className="cursor-grab select-none px-0.5 text-slate-400 hover:text-slate-700 active:cursor-grabbing"
        >⋮⋮</span>}
        <div className="flex flex-col">
          <IconButton disabled={!p.canMoveUp} onClick={() => p.onMove(-1)} aria-label="Move column up" className="!h-3.5">▲</IconButton>
          <IconButton disabled={!p.canMoveDown} onClick={() => p.onMove(1)} aria-label="Move column down" className="!h-3.5">▼</IconButton>
        </div>
        <TextInput value={c.name} onChange={(e) => p.onChange({ name: e.target.value })} aria-label="Column name" className="mono min-w-0" />
        <TextInput
          value={c.dataType}
          list="dbd-types"
          onChange={(e) => p.onChange({ dataType: e.target.value })}
          aria-label="Data type"
          className="mono !w-32 shrink-0"
        />
        <IconButton active={open} onClick={() => setOpen(!open)} aria-label="More options">⋯</IconButton>
        <IconButton onClick={p.onDelete} aria-label="Delete column" className="hover:!bg-red-100 hover:!text-red-600">✕</IconButton>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-6">
        <Chip on={c.primaryKey} onClick={() => p.onChange({ primaryKey: !c.primaryKey })} title="Primary key">PK</Chip>
        <Chip on={p.isFk} onClick={() => !p.isFk && setOpen(true)} title="Foreign key (set under ⋯)" className={p.isFk ? "" : "opacity-70"}>FK</Chip>
        <Chip on={c.notNull} onClick={() => p.onChange({ notNull: !c.notNull })} title="NOT NULL">NN</Chip>
        <Chip on={c.unique} onClick={() => p.onChange({ unique: !c.unique })} title="UNIQUE">UQ</Chip>
        <Chip on={c.autoIncrement} onClick={() => p.onChange({ autoIncrement: !c.autoIncrement })} title="Identity / auto increment">AI</Chip>
        <Chip on={c.logicalErd} onClick={() => p.onChange({ logicalErd: !c.logicalErd })} title="Show in the logical view (columns with a mandatory property — see Settings — are always shown)">Logical</Chip>
      </div>
      {open && (
        <div className="mt-2 space-y-2 pl-6">
          <Field label="Description">
            <TextArea value={c.description} onChange={(e) => p.onChange({ description: e.target.value })} />
          </Field>
          <Field label="Enum values (comma separated)">
            <TextInput value={c.enumValues} onChange={(e) => p.onChange({ enumValues: e.target.value })} className="mono" placeholder="e.g. draft, paid, shipped" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Default">
              <TextInput value={c.defaultValue} onChange={(e) => p.onChange({ defaultValue: e.target.value })} className="mono" placeholder="e.g. 0, 'x'" />
            </Field>
            <Field label="Check">
              <TextInput value={c.check} onChange={(e) => p.onChange({ check: e.target.value })} className="mono" placeholder="e.g. price >= 0" />
            </Field>
          </div>
          <div className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
            <Field label="Foreign key — 1. Reference table">
              <SelectInput value={fkTable} onChange={(e) => pickTable(e.target.value)} aria-label="Reference table">
                <option value="">— none —</option>
                {p.fkOptions.map((t) => <option key={t.tableId} value={t.tableId}>{t.tableName}</option>)}
              </SelectInput>
            </Field>
            {fkTable && (
              <Field label="2. Reference column (primary key / unique columns)">
                <SelectInput value={fkColumn ?? ""} onChange={(e) => p.onFkChange(e.target.value ? `${fkTable}:${e.target.value}` : "")} aria-label="Reference column">
                  <option value="">— select a column —</option>
                  {candidates.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}{col.pk ? " (PK)" : col.unique ? " (UQ)" : " (not PK/UQ)"}
                    </option>
                  ))}
                </SelectInput>
                {candidates.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">{refTable?.tableName} has no primary key or unique column to reference.</p>
                )}
                {candidates.length > 0 && !fkColumn && <p className="mt-1 text-xs text-slate-400">Pick the column to complete the foreign key.</p>}
              </Field>
            )}
          </div>
          <Field label="Group">
            <SelectInput value={p.groupId} onChange={(e) => p.onGroupChange(e.target.value)}>
              <option value="">— no group —</option>
              {p.groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          </Field>
        </div>
      )}
      <datalist id="dbd-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}
