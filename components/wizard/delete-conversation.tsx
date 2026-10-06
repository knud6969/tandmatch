"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";

// "Slet min samtale og mine billeder" for anonyme (architecture 7.7, 9.4). Kræver bekræftelse med "SLET".
export function DeleteConversation({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm !== "SLET") {
      setError("Skriv SLET med store bogstaver for at bekræfte.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiRequest<void>("/api/patients/me", { method: "DELETE", body: { confirm: "SLET" } });
      await onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <details className="rounded-xl border border-line bg-surface p-5">
      <summary className="cursor-pointer rounded-md text-base font-semibold text-brand-700">
        Slet min samtale og mine billeder
      </summary>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-4 flex flex-col gap-4">
        <Alert tone="warning" title="Det kan ikke fortrydes">
          <p>Din samtale, dine svar og dine billeder slettes med det samme. Du kan ikke hente dem igen.</p>
        </Alert>
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <TextField
          label="Skriv SLET for at bekræfte"
          name="confirm"
          autoComplete="off"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button type="submit" variant="secondary" fullWidth className="sm:w-auto" disabled={pending}>
          {pending ? "Sletter …" : "Slet min samtale"}
        </Button>
      </form>
    </details>
  );
}
