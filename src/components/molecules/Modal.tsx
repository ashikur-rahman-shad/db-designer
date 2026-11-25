"use client";
import { useEffect, type ReactNode } from "react";
import { IconButton } from "../atoms/IconButton";

export function Modal({
  title, onClose, children, footer, width = "max-w-lg", headerExtra,
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string; /** Shown in the title bar, beside the title. */ headerExtra?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full ${width} flex-col rounded-lg bg-white shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {headerExtra}
          </div>
          <IconButton onClick={onClose} aria-label="Close">✕</IconButton>
        </div>
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto overflow-x-hidden whitespace-normal break-words p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
