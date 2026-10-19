"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { deleteAccountSchema } from "@/lib/schemas/auth";
import { useSession } from "@/views/components/session/session-provider";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";

// Sletning af patientens konto (architecture 6.2, 10.2). Advarsel om konsekvenserne og en skrevet bekræftelse.
export function DeletePatientAccount() {
  const router = useRouter();
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = deleteAccountSchema.safeParse({ confirm: confirm.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Skriv SLET for at bekræfte.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await apiRequest<void>("/api/patients/me", { method: "DELETE", body: parsed.data });
      await refresh();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(apiErrorMessage(e));
      setPending(false);
    }
  }

  const close = () => {
    setOpen(false);
    setConfirm("");
    setError(null);
  };

  return (
    <Card className="flex flex-col gap-4 border-danger-line p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-danger-ink">Slet konto</h2>
      {!open ? (
        <>
          <p className="text-base text-ink-muted">Du kan slette din konto og alle dine data. Det kan ikke fortrydes, så læs konsekvenserne først.</p>
          <Button variant="danger-outline" className="w-full sm:w-fit" onClick={() => setOpen(true)}>
            Slet kontoen …
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Alert tone="danger" title="Du er ved at slette din konto">
            <ul className="list-disc space-y-1 pl-5">
              <li>Alt slettes med det samme: dine sager, billeder, samtaler, samtykker, henvendelser, beskeder, bookinger og anmeldelser.</li>
              <li>Kommende tider forsvinder fra klinikkens kalender, og klinikken får ikke besked om det.</li>
              <li>Anmeldelser, du har skrevet, forsvinder fra klinikkens profil.</li>
              <li>Du bliver logget ud, og det kan ikke fortrydes. Hent dine data først, hvis du vil beholde en kopi.</li>
            </ul>
          </Alert>
          <TextField
            label="Skriv SLET for at bekræfte"
            name="confirm"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error ?? undefined}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" variant="danger" disabled={pending || confirm.trim() !== "SLET"}>
              {pending ? "Sletter …" : "Slet kontoen permanent"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={close}>
              Fortryd
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
