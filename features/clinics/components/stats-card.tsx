import type { ReactNode } from "react";

// Ét tal i statistikken: titel, stort tal og en kort linje under. Tal, der ikke kan beregnes, vises som "–" af kalderen.
export function StatsCard({ id, title, value, note }: { id: string; title: string; value: ReactNode; note?: string | null }) {
  return (
    <li className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 shadow-card" data-testid={`statistik-${id}`}>
      <h2 className="text-sm font-semibold text-ink-muted">{title}</h2>
      <p className="text-3xl font-semibold tracking-tight text-ink" data-testid={`statistik-${id}-vaerdi`}>
        {value}
      </p>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
    </li>
  );
}
