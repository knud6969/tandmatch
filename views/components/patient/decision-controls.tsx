"use client";

import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage, STALE_STATE_CODES } from "@/views/utils/api-errors";
import type { ResponseDto } from "@/lib/types/responses";

export type Decision = "chosen" | "declined";

type DecisionControlsProps = {
  response: ResponseDto;
  dentistName: string;
  onDecided: (decision: Decision) => void;
  // Kaldes når serveren siger, at visningen er forældet, så siden henter data igen.
  onStale: () => void;
};

// Patientens valg på et aktivt svar. Der bekræftes altid først, fordi valget lukker forespørgslen (valgt) eller ikke kan fortrydes (afvist).
export function DecisionControls({ response, dentistName, onDecided, onStale }: DecisionControlsProps) {
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setPending(true);
    setError(null);
    try {
      await apiRequest<ResponseDto>(`/api/responses/${response.id}/decision`, {
        method: "POST",
        body: { decision },
      });
      setPending(false);
      setConfirming(null);
      onDecided(decision);
    } catch (err) {
      setPending(false);
      setConfirming(null);
      setError(apiErrorMessage(err));
      if (err instanceof ApiRequestError && (STALE_STATE_CODES as readonly string[]).includes(err.code)) {
        onStale();
      }
    }
  }

  return (
    <section aria-label={`Valg for svaret fra ${dentistName}`} className="flex flex-col gap-4 border-t border-line pt-6">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {confirming === null && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => setConfirming("chosen")} className="w-full sm:w-auto">
            Vælg denne tandlæge
          </Button>
          <Button variant="secondary" onClick={() => setConfirming("declined")} className="w-full sm:w-auto">
            Afvis
          </Button>
        </div>
      )}

      {confirming === "chosen" && (
        <Alert tone="warning" title={`Vælg ${dentistName}?`}>
          <p>
            Når du vælger en tandlæge, lukkes din forespørgsel. De andre svar kan ikke længere vælges, og tandlægerne kan
            ikke ændre deres svar. Valget kan ikke fortrydes.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => decide("chosen")} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Gemmer …" : "Ja, vælg denne tandlæge"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending} className="w-full sm:w-auto">
              Annuller
            </Button>
          </div>
        </Alert>
      )}

      {confirming === "declined" && (
        <Alert tone="warning" title={`Afvis svaret fra ${dentistName}?`}>
          <p>
            Du kan ikke fortryde et afvist svar. Din forespørgsel forbliver åben, så du stadig kan vælge et af de andre
            svar.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => decide("declined")} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Gemmer …" : "Ja, afvis svaret"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending} className="w-full sm:w-auto">
              Annuller
            </Button>
          </div>
        </Alert>
      )}
    </section>
  );
}
