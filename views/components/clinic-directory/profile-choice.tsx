"use client";

import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { caseHref, sendHref } from "@/views/utils/case-links";
import type { CompareChoice } from "@/views/utils/compare-selection";
import { useCaseChoices } from "@/views/utils/use-case-selection";

// "Vælg klinik" på klinikprofilen, når patienten kommer fra en sag (?sag=). Samme valg som i oversigten (sessionStorage).
export function ProfileChoice({ caseId, clinic }: { caseId: string; clinic: CompareChoice }) {
  const { sag, chosen, slots, canChoose, full, isChosen, toggle } = useCaseChoices(caseId);
  if (!sag) return null; // Uden sag (hentes stadig, fejl) vises profilen som almindelig profil.

  if (sag.contactedIds.includes(clinic.id)) {
    return (
      <Alert tone="info" title="Du har allerede kontaktet klinikken">
        <p>Din sag er sendt til klinikken. Se status under din sag.</p>
        <LinkButton href={caseHref(caseId)} variant="secondary" className="mt-3 w-full">
          Gå til din sag
        </LinkButton>
      </Alert>
    );
  }
  if (!canChoose) return null;

  const selected = isChosen(clinic.id);

  return (
    <section aria-label="Vælg klinik til din sag" className="flex flex-col gap-3 rounded-card border border-brand-200 bg-brand-50 p-4">
      <p className="text-base font-semibold text-brand-800">
        {chosen.length} af {slots} mulige klinikker valgt
      </p>
      <Button variant={selected ? "secondary" : "primary"} onClick={() => toggle(clinic)} disabled={!selected && full} aria-pressed={selected}>
        {selected ? "Fjern valg af klinikken" : "Vælg klinik"}
      </Button>
      {!selected && full && <p className="text-sm text-ink-muted">Du har valgt så mange klinikker, som der er plads til. Fjern en for at vælge denne.</p>}
      {chosen.length > 0 && (
        <LinkButton href={sendHref(caseId, chosen.map((c) => c.id))} variant="secondary">
          Kontakt de valgte klinikker
        </LinkButton>
      )}
    </section>
  );
}
