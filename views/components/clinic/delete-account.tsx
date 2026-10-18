"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { TextField } from "@/views/components/ui/text-field";
import { useSession } from "@/views/components/session/session-provider";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { deleteClinicSchema } from "@/lib/schemas/clinics";

// Sletning af klinikkontoen (architecture 10.8). Tydelig advarsel om konsekvenserne og en skrevet bekræftelse.
export function DeleteAccount({ clinicName }: { clinicName: string }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = deleteClinicSchema.safeParse({ confirm: confirm.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Skriv SLET for at bekræfte.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await apiRequest<void>("/api/clinics/me", { method: "DELETE", body: parsed.data });
      await refresh();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(apiErrorMessage(e));
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 border-danger-line">
      <h2 className="text-xl font-semibold text-danger-ink">Slet konto</h2>
      {!open ? (
        <>
          <p className="text-base text-ink-muted">
            Du kan slette klinikkens konto. Det kan ikke fortrydes, så læs konsekvenserne først.
          </p>
          <Button variant="danger-outline" className="self-start" onClick={() => setOpen(true)}>
            Slet kontoen …
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Alert tone="danger" title={`Du er ved at slette ${clinicName}`}>
            <ul className="list-disc space-y-1 pl-5">
              <li>Dit login og kontoen slettes med det samme, og du bliver logget ud.</li>
              <li>Åbne henvendelser afvises, og patienterne kan se det på deres sag.</li>
              <li>Fremtidige bookinger aflyses.</li>
              <li>Tandlæger, portræt- og porteføljebilleder, logo, prisliste og blokerede tider slettes.</li>
              <li>
                Er klinikken oprettet af dig, fjernes den fra TandMatch. Patienter, der har haft kontakt med klinikken, kan
                stadig se klinikkens navn i deres historik.
              </li>
              <li>
                Har kontoen overtaget en klinik, der var importeret på forhånd, bliver de oprindelige grunddata stående
                som en uverificeret klinik uden ejer, indtil nogen overtager den.
              </li>
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
            <Button variant="ghost" disabled={pending} onClick={() => { setOpen(false); setConfirm(""); setError(null); }}>
              Fortryd
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
