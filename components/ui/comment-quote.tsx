import type { ReactNode } from "react";

// Citat med en kommentar, fx klinikkens kommentar til patienten.
export function CommentQuote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <blockquote className="rounded-control bg-surface-muted p-3 text-base text-ink">
      <p className="mb-1 text-sm font-semibold text-ink-muted">{title}</p>
      {children}
    </blockquote>
  );
}
