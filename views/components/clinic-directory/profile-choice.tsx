"use client";

import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { caseHref, sendHref } from "@/views/utils/case-links";
import { readSelection, writeSelection, type CompareChoice } from "@/views/utils/compare-selection";
import { useCaseSelection } from "@/views/utils/use-case-selection";

// "Vælg klinik" på klinikprofilen, når patienten kommer fra en sag (?sag=). Samme valg som i oversigten (sessionStorage).
export function ProfileChoice({ caseId, clinic }: { caseId: string; clinic: CompareChoice }) {
  const state = useCaseSelection(caseId);
  const [picked, setPicked] = useState<CompareChoice[]>(() => readSelection(caseId));
  const sag = state.data;
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
  if (!sag.caseDto.canSend || sag.slots === 0) return null;

  const chosen = picked.filter((c) => !sag.contactedIds.includes(c.id)).slice(0, sag.slots);
  const selected = chosen.some((c) => c.id === clinic.id);
  const full = chosen.length >= sag.slots;

  function toggle() {
    const next = selected ? chosen.filter((c) => c.id !== clinic.id) : [...chosen, clinic];
    setPicked(next);
    writeSelection(caseId, next);
  }

  return (
    <section aria-label="Vælg klinik til din sag" className="flex flex-col gap-3 rounded-card border border-brand-200 bg-brand-50 p-4">
      <p className="text-base font-semibold text-brand-800">
        {chosen.length} af {sag.slots} mulige klinikker valgt
      </p>
      <Button variant={selected ? "secondary" : "primary"} onClick={toggle} disabled={!selected && full} aria-pressed={selected}>
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
