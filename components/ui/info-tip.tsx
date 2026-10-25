import type { ReactNode } from "react";

// Hjælpetekst på én linje med et "?", der folder resten ud (features/clinics/README.md 6.3: hjælpetekster er højst én linje).
// Bygget på <details>, så den virker med tastatur og skærmlæser uden JavaScript.
export function InfoTip({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="text-sm text-ink-muted">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span
          aria-hidden="true"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-field-border text-xs font-bold text-ink"
        >
          ?
        </span>
        <span className="sr-only">Vis mere</span>
      </summary>
      <div className="rounded-control bg-surface-muted p-3 leading-relaxed">{children}</div>
    </details>
  );
}
