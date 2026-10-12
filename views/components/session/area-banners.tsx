"use client";

import { Alert } from "@/views/components/ui/alert";
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
        Du skal have en konto, før du kan sende din sag til klinikker.
      </p>
      <LinkButton href="/opret/patient" variant="secondary" className="mt-3">
        Opret konto og gem min samtale
      </LinkButton>
    </Alert>
  );
}
