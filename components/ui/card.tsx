import type { ComponentProps } from "react";
import { cx } from "@/components/ui/cx";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cx("rounded-card border border-line bg-surface p-5 shadow-card sm:p-8", className)}
      {...props}
    />
  );
}
