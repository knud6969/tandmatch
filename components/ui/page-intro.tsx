import type { ReactNode } from "react";

// Fælles sidehoved: H1 og en kort ingress. Én H1 pr. side.
export function PageIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {children && <div className="text-base leading-relaxed text-ink-muted sm:text-lg">{children}</div>}
    </header>
  );
}
