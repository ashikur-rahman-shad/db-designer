"use client";
import { useState } from "react";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { DesignMetaForm } from "../molecules/DesignMetaForm";
import { Modal } from "../molecules/Modal";

export function DesignInfoModal({ onClose }: { onClose: () => void }) {
  const [meta, setMeta] = useState(useEditor.getState().meta);
  return (
    <Modal
      title="Design info" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { useEditor.getState().setMeta(meta); onClose(); }}>Save</Button></>}
    >
      <DesignMetaForm value={meta} onChange={setMeta} />
      <p className="mt-3 text-xs text-slate-400">Short and long descriptions are written as comments at the top of exported SQL.</p>
    </Modal>
  );
}
