"use client";
import { useEffect, type ReactNode } from "react";
import { Button } from "../atoms/Button";

/** Full-viewport dialog with a title bar (actions slot + Close button). */
export function FullScreenModal({
  title, onClose, actions, children,
}: { title: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <Button variant="primary" onClick={onClose}>Close</Button>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-slate-50">{children}</div>
    </div>
  );
}
