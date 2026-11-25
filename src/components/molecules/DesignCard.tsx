import Link from "next/link";
import type { DesignSummary } from "@/domain/types";
import { Button } from "../atoms/Button";

export function DesignCard({
  design, onEdit, onDuplicate, onDelete,
}: { design: DesignSummary; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <Link href={`/designs/${design.id}`} className="text-base font-semibold text-slate-900 hover:text-blue-700">
        {design.name}
      </Link>
      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-600">
        {design.shortDescription || <span className="italic text-slate-400">No description</span>}
      </p>
      <p className="mt-2 text-xs text-slate-400">
        {design.tableCount} table{design.tableCount === 1 ? "" : "s"} · updated {new Date(design.updatedAt).toLocaleString()}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/designs/${design.id}`}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Open
        </Link>
        <Button onClick={onEdit}>Edit info</Button>
        <Button onClick={onDuplicate} title="Create a copy of this design (version history is not copied)">Duplicate</Button>
        <Button variant="danger" onClick={onDelete} className="ml-auto">Delete</Button>
      </div>
    </div>
  );
}
