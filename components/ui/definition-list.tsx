import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type DefinitionItem = { label: string; value: ReactNode };

// Nøgle-værdi-visning (fx pris, tid, område). Én kolonne på mobil, to fra sm.
export function DefinitionList({ items, className }: { items: DefinitionItem[]; className?: string }) {
  return (
    <dl className={cx("grid gap-4 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <dt className="text-sm font-semibold text-ink-muted">{item.label}</dt>
          <dd className="whitespace-pre-line text-base leading-relaxed text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
