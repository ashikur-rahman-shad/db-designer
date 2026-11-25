import type { ButtonHTMLAttributes } from "react";

/** Small on/off toggle used for column flags (PK, NN, UQ, ...). */
export function Chip({
  on, className = "", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...rest}
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors ${
        on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
      } ${className}`}
    />
  );
}
