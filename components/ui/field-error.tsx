import type { ReactNode } from "react";
import { StatusIcon } from "@/components/ui/status-icon";

// Fejl under ét felt (tekstfelt, valg, afkrydsning). Kobles til feltet med aria-describedby via `id`. Placeres lige under
// feltet, i samme farve og med samme ikon som alle andre fejl.
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-danger-ink">
      <StatusIcon tone="danger" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
