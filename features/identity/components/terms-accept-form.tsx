"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/identity/constants/legal";
import { safeInternalPath } from "@/lib/common/navigation/paths";
import type { TermsAcceptedDto } from "@/lib/identity/types/auth";

// Vilkårs-gaten. Accepten er IKKE samtykke til helbredsdata (architecture 2.5). Ingen afkrydsninger her.
export function TermsAcceptForm({ naeste }: { naeste: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      await apiRequest<TermsAcceptedDto>("/api/terms/accept", {
        method: "POST",
        body: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
      });
      // Hård navigation: kom brugeren hertil via en klientnavigation fra en side uden gate (fx forsiden), har routeren
      // cachet proxy'ens redirect hertil, og router.replace ville lande på gaten igen. En ny sideindlæsning henter også sessionen.
      window.location.replace(safeInternalPath(naeste ?? undefined) ?? "/");
    } catch (err) {
      setError(apiErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <Button fullWidth onClick={accept} disabled={pending}>
        {pending ? "Gemmer dit valg …" : "Jeg accepterer vilkårene og har læst privatlivspolitikken"}
      </Button>
    </div>
  );
}
