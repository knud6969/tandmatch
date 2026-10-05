import type { ComponentProps } from "react";
import { cx } from "@/components/ui/cx";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cx("rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8", className)}
      {...props}
    />
  );
}
