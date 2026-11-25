import type { ButtonHTMLAttributes } from "react";

export function IconButton({
  active, className = "", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs transition-colors disabled:opacity-30 disabled:pointer-events-none ${
        active ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-200"
      } ${className}`}
    />
  );
}
