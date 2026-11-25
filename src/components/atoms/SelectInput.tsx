import type { SelectHTMLAttributes } from "react";

export function SelectInput({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm outline-none focus:border-blue-500 ${className}`}
    />
  );
}
