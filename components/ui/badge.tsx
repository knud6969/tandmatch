import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type BadgeTone = "neutral" | "brand" | "warning";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-canvas text-ink ring-line",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  warning: "bg-warning-bg text-warning-ink ring-warning-line",
};

// Små etiketter, fx "Pladsholder", "Afventer verifikation" eller "Kommer snart".
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
