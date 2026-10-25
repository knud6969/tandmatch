"use client";

import type { ReactNode } from "react";
import { LeadInbox } from "@/features/leads/components/lead-inbox";
import { cx } from "@/components/ui/cx";

// Indbakkens layout (features/clinics/README.md 6.3): på mobil enten listen (/klinik) eller ét lead (/klinik/lead/[id]); fra lg
// står listen til venstre og det valgte lead (eller en tom tilstand) til højre. Listen ruller for sig selv på lg, så den bliver
// stående, mens klinikken læser leadet.
export function InboxLayout({ selectedId, children }: { selectedId?: string; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <section
        aria-labelledby="indbakke-liste"
        className={cx(
          "min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1",
          selectedId ? "hidden" : "flex",
        )}
      >
        <h2 id="indbakke-liste" className={cx("text-lg font-semibold text-ink", !selectedId && "sr-only lg:not-sr-only")}>
          Henvendelser
        </h2>
        <LeadInbox selectedId={selectedId} />
      </section>
      <div className={cx("min-w-0", !selectedId && "hidden lg:block")}>{children}</div>
    </div>
  );
}

// Højre side på /klinik fra lg, før et lead er valgt.
export function NoLeadSelected() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-card border border-dashed border-line p-6 text-center">
      <p className="text-base text-ink-muted">Vælg en henvendelse i listen.</p>
    </div>
  );
}
