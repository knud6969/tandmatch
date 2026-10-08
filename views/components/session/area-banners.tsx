"use client";

import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { LinkButton } from "@/views/components/ui/button";
import { useSession } from "@/views/components/session/session-provider";

const dateFormat: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" };

// Tydelig besked til anonyme patienter om, at data kun gemmes i en kort periode, og at de kan oprette konto.
export function AnonymousPatientBanner() {
  const { state } = useSession();
  if (state.status !== "ready" || !state.me?.isAnonymous) return null;

  const expires = state.me.anonymousExpiresAt
    ? new Date(state.me.anonymousExpiresAt).toLocaleString("da-DK", dateFormat)
    : null;

  return (
    <Alert tone="warning" title="Du bruger TandMatch uden konto">
      <p>
        {expires
          ? `Din session gemmes til ${expires}, hvis du ikke opretter en konto.`
          : "Din session gemmes i en kort periode, hvis du ikke opretter en konto."}{" "}
        Du skal have en konto, før du kan sende en forespørgsel til tandlæger.
      </p>
      <LinkButton href="/opret/patient" variant="secondary" className="mt-3">
        Opret konto og gem min samtale
      </LinkButton>
    </Alert>
  );
}

// Viser tydeligt, om tandlægen er verificeret. Uverificerede tandlæger kan ikke modtage forespørgsler.
export function DentistVerificationBanner() {
  const { state } = useSession();
  if (state.status !== "ready" || state.me?.role !== "dentist") return null;

  if (state.me.dentistVerified) {
    return (
      <Alert tone="success" title="Din profil er verificeret">
        <p>Din autorisation er kontrolleret, og du kan modtage forespørgsler, der matcher din profil.</p>
      </Alert>
    );
  }

  return (
    <Alert tone="warning" title="Afventer verifikation">
      <p>
        Din profil er oprettet, men din autorisation er ikke kontrolleret endnu. Du modtager først forespørgsler,
        når en administrator har verificeret din profil.
      </p>
      <p className="mt-2">
        <Badge tone="warning">Ikke verificeret</Badge>
      </p>
    </Alert>
  );
}
