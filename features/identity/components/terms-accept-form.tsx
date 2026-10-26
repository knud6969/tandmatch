"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TermsDialog } from "@/features/identity/components/terms-dialog";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/identity/constants/legal";
import { safeInternalPath } from "@/lib/common/navigation/paths";
import type { TermsAcceptedDto } from "@/lib/identity/types/auth";

// Vilkårs-gaten. Accepten er IKKE samtykke til helbredsdata (architecture 2.5). Ingen afkrydsninger her: accepten gives i
// vilkårs-dialogen, når teksten er læst til bunden. legalText er vilkår og privatlivspolitik, renderet på serveren af siden.
export function TermsAcceptForm({ naeste, legalText }: { naeste: string | null; legalText: ReactNode }) {
  const [open, setOpen] = useState(false);
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
    <>
      <Button fullWidth onClick={() => setOpen(true)}>
        Læs og accepter vilkårene
      </Button>
      <TermsDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        onAccept={accept}
        pending={pending}
        acceptLabel={pending ? "Gemmer dit valg …" : "Jeg accepterer vilkårene og har læst privatlivspolitikken"}
        error={
          error && (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          )
        }
      >
        {legalText}
      </TermsDialog>
    </>
  );
}
