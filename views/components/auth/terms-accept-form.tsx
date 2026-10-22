"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSession } from "@/views/components/session/session-provider";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import { safeInternalPath } from "@/lib/common/navigation/paths";
import type { TermsAcceptedDto } from "@/lib/types/auth";

// Vilkårs-gaten. Accepten er IKKE samtykke til helbredsdata (architecture 2.5). Ingen afkrydsninger her.
export function TermsAcceptForm({ naeste }: { naeste: string | null }) {
  const router = useRouter();
  const { refresh } = useSession();
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
      await refresh();
      router.replace(safeInternalPath(naeste ?? undefined) ?? "/");
      router.refresh();
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
