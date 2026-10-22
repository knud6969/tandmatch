import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

// `wide` lader en række fylde hele bredden, når listen står i to kolonner på mobil (`compact`).
export type DefinitionItem = { label: string; value: ReactNode; wide?: boolean };

// Nøgle-værdi-visning (fx pris, tid, område). Én kolonne på mobil, to fra sm. `compact` giver to kolonner også på mobil, så korte
// felter ikke fylder en hel linje hver.
export function DefinitionList({ items, className, compact = false }: { items: DefinitionItem[]; className?: string; compact?: boolean }) {
  return (
    <dl className={cx("grid gap-x-4 gap-y-3 sm:grid-cols-2 sm:gap-4", compact && "grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className={cx("flex min-w-0 flex-col gap-0.5 sm:gap-1", item.wide && "col-span-2 sm:col-span-1")}>
          <dt className="text-sm font-semibold text-ink-muted">{item.label}</dt>
          <dd className="whitespace-pre-line break-words text-base leading-relaxed text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
