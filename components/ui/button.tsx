import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "@/components/ui/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";

// Mindst 48 px høje på mobil (store trykflader). Ghost-knapper i navigation bruger min-h-11 (44 px).
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-base font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-on-brand shadow-sm hover:bg-brand-700",
  secondary: "bg-surface text-brand-700 ring-1 ring-inset ring-brand-600 hover:bg-brand-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  // Til uigenkaldelige handlinger (fx slet konto). Kontrast: hvid på danger-ink er over 7:1.
  danger: "bg-danger-ink text-on-brand shadow-sm hover:opacity-90",
  "danger-outline": "bg-surface text-danger-ink ring-1 ring-inset ring-danger-line hover:bg-danger-bg",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(base, variants[variant], fullWidth && "w-full", className)}
      {...props}
    />
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

// Link, der ser ud som en knap. Bruges til navigation, ikke til handlinger.
export function LinkButton({
  variant = "primary",
  fullWidth = false,
  className,
  ...props
}: LinkButtonProps) {
  return <Link className={cx(base, variants[variant], fullWidth && "w-full", className)} {...props} />;
}
