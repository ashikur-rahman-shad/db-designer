"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DesignMeta, DesignSummary } from "@/domain/types";
import type { ViewOptions } from "@/domain/viewOptions";
import { saveViewOptions } from "@/lib/viewOptionsApi";
import { Button } from "../atoms/Button";
import { DesignCard } from "../molecules/DesignCard";
import { DesignMetaForm } from "../molecules/DesignMetaForm";
import { Modal } from "../molecules/Modal";
import { ViewOptionsFields } from "../molecules/ViewOptionsFields";
import { HomeMenuBar } from "../organisms/HomeMenuBar";
import { ImportModal } from "../organisms/ImportModal";

const EMPTY: DesignMeta = { name: "", shortDescription: "", longDescription: "" };

type Dialog = { kind: "new" } | { kind: "edit"; design: DesignSummary } | { kind: "import" } | { kind: "settings" } | null;

export function DesignListTemplate({ initial, viewOptions: initialView }: { initial: DesignSummary[]; viewOptions: ViewOptions }) {
  const router = useRouter();
  const [designs, setDesigns] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState<DesignMeta>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [viewOptions, setViewOptions] = useState(initialView);

  /** View options are remembered per user and apply to every diagram when it opens. */
  const changeView = (patch: Partial<ViewOptions>) => {
    const next = { ...viewOptions, ...patch };
    setViewOptions(next);
    void saveViewOptions(next);
  };

  const refresh = async () => setDesigns(await (await fetch("/api/designs")).json());

  const openNew = () => { setForm(EMPTY); setDialog({ kind: "new" }); };
  const openEdit = (d: DesignSummary) => {
    setForm({ name: d.name, shortDescription: d.shortDescription, longDescription: d.longDescription });
    setDialog({ kind: "edit", design: d });
  };

  const save = async () => {
    if (!dialog || dialog.kind === "import" || dialog.kind === "settings") return;
    setBusy(true);
    try {
      if (dialog.kind === "new") {
        const res = await fetch("/api/designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const d = await res.json();
        router.push(`/designs/${d.id}`);
      } else {
        await fetch(`/api/designs/${dialog.design.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        setDialog(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (d: DesignSummary) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${d.id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      await refresh();
    } catch {
      alert("Could not duplicate the design.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: DesignSummary) => {
    if (!confirm(`Delete “${d.name}”? This cannot be undone.`)) return;
    await fetch(`/api/designs/${d.id}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <>
    <HomeMenuBar
      viewOptions={viewOptions}
      onChange={changeView}
      onNew={openNew}
      onImport={() => setDialog({ kind: "import" })}
      onSettings={() => setDialog({ kind: "settings" })}
    />
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Database designs</h1>
          <p className="text-sm text-slate-500">Create, open and manage your ER designs.</p>
        </div>
        <Button className="ml-auto" onClick={() => setDialog({ kind: "import" })}>Import SQL / JSON</Button>
        <Button variant="primary" onClick={openNew}>+ New design</Button>
      </div>

      {designs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500">
          No designs yet. Create one or import existing SQL to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => <DesignCard key={d.id} design={d} onEdit={() => openEdit(d)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} />)}
        </div>
      )}

      {(dialog?.kind === "new" || dialog?.kind === "edit") && (
        <Modal
          title={dialog.kind === "new" ? "New design" : "Edit design info"}
          onClose={() => setDialog(null)}
          footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" disabled={busy || !form.name.trim()} onClick={save}>{dialog.kind === "new" ? "Create & open" : "Save"}</Button></>}
        >
          <DesignMetaForm value={form} onChange={setForm} />
        </Modal>
      )}

      {dialog?.kind === "settings" && (
        <Modal title="Settings" onClose={() => setDialog(null)} footer={<Button variant="primary" onClick={() => setDialog(null)}>Done</Button>}>
          <p className="mb-4 text-sm text-slate-600">
            View options are remembered and applied to <b>every diagram</b> when it opens. Settings that belong to one diagram
            (line style, mandatory logical columns, …) are in that diagram&apos;s own Settings menu.
          </p>
          <ViewOptionsFields value={viewOptions} onChange={changeView} />
        </Modal>
      )}

      {dialog?.kind === "import" && (
        <ImportModal
          onClose={() => setDialog(null)}
          onImport={async ({ meta, data }) => {
            const res = await fetch("/api/designs", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: meta.name || "Imported design", shortDescription: meta.shortDescription ?? "", longDescription: meta.longDescription ?? "", data }),
            });
            router.push(`/designs/${(await res.json()).id}`);
          }}
        />
      )}
    </main>
    </>
  );
}
