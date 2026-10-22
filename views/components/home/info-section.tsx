import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";

export function PrototypeNote({ children }: { children: ReactNode }) {
  return (
    <Alert tone="warning" title="Prototype">
      {children}
    </Alert>
  );
}

// Overskrift og indhold i en informationsside.
export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}
