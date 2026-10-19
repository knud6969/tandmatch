"use client";

import { useState } from "react";
import { CLOSE_CASE_CONSEQUENCE } from "@/lib/constants/cases";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { useAction } from "@/views/utils/use-action";

type Props = { caseId: string; onClosed: () => void };

// "Luk sag" nederst på en sendt sag med bekræftelse (architecture 6.2, 10.5). Bookede tider består.
export function CloseCase({ caseId, onClosed }: Props) {
  const [confirming, setConfirming] = useState(false);
  const close = useAction();

  async function closeCase() {
    const ok = await close.run(async () => {
      await apiRequest(`/api/cases/${caseId}/close`, { method: "POST", body: {} });
    });
    if (ok) onClosed();
    else setConfirming(false);
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5" data-testid="luk-sag">
      <h2 className="text-lg font-semibold text-ink">Er du færdig med sagen?</h2>
      <StatusMessage message={close.message} />
      {confirming ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink" id="luk-sag-konsekvens">
            {CLOSE_CASE_CONSEQUENCE}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label="Bekræft lukning af sagen" aria-describedby="luk-sag-konsekvens">
            <Button variant="danger" onClick={closeCase} disabled={close.busy}>
              {close.busy ? "Lukker …" : "Ja, luk sagen"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={close.busy}>
              Annuller
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="danger-outline" onClick={() => setConfirming(true)} className="w-full sm:w-fit">
            Luk sag
          </Button>
        </div>
      )}
    </Card>
  );
}
