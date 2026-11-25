import type { TextareaHTMLAttributes } from "react";

export function TextArea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={2}
      {...rest}
      className={`w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${className}`}
    />
  );
}
