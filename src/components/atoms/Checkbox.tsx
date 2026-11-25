import type { InputHTMLAttributes, ReactNode } from "react";

export function Checkbox({
  label, ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" {...rest} className="h-4 w-4 accent-blue-600" />
      {label}
    </label>
  );
}
