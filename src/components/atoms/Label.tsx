import type { ReactNode } from "react";

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</span>;
}
