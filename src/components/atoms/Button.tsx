import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border-transparent",
  secondary: "bg-white text-slate-700 hover:bg-slate-50 border-slate-300",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 border-transparent",
  danger: "bg-white text-red-600 hover:bg-red-50 border-red-200",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    />
  );
}
