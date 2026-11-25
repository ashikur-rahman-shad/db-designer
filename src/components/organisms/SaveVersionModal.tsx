"use client";
import { useState } from "react";
import { saveVersion } from "@/lib/designApi";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { TextArea } from "../atoms/TextArea";
import { Field } from "../molecules/Field";
import { Modal } from "../molecules/Modal";

export function SaveVersionModal({ onClose }: { onClose: () => void }) {
  const next = useEditor((s) => s.versionInfo.latest) + 1;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveVersion(note);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Save version ${next}`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : `Save version ${next}`}</Button></>}
    >
      <Field label="Note (optional)">
        <TextArea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed in this version?" />
      </Field>
      <p className="mt-2 text-xs text-slate-400">
        Every edit is already saved automatically as the latest state. A version is a permanent, numbered snapshot you can restore later.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
