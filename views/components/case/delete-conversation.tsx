"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { useAction } from "@/views/utils/use-action";

// "Slet min samtale": sletter kladden med samtale, opsummering og billeder (DELETE /api/cases/{id}). Kræver en bekræftelse.
export function DeleteConversation({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const action = useAction();

  async function remove() {
    const ok = await action.run(async () => {
      await apiRequest(`/api/cases/${caseId}`, { method: "DELETE" });
    });
    if (ok) router.replace("/start");
  }

  if (!confirming) {
    return (
      <Button variant="danger-outline" onClick={() => setConfirming(true)}>
        Slet min samtale
      </Button>
    );
  }
  return (
    <Alert tone="danger" title="Slet samtalen og sagen?">
      <p>Din samtale, opsummering og dine billeder slettes for altid. Det kan ikke fortrydes.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button variant="danger" onClick={remove} disabled={action.busy}>
          {action.busy ? "Sletter …" : "Ja, slet alt"}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={action.busy}>
          Behold
        </Button>
      </div>
      <div className="mt-3">
        <StatusMessage message={action.message} />
      </div>
    </Alert>
  );
}
