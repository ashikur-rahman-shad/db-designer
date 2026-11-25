import type { InputHTMLAttributes } from "react";

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${className}`}
    />
  );
}
