"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DefinitionList } from "@/components/ui/definition-list";
import { ClinicForm } from "@/components/dentist/clinic-form";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import type { ClinicDto, DentistMeDto } from "@/lib/types/dentist";

type State =
  | { status: "loading" }
  | { status: "ready"; me: DentistMeDto }
  | { status: "error"; message: string };

// Tandlægens egen profil (architecture 6.3, 10.8). Autorisations-ID vises kun; det kan kun ændres af administrator.
export function DentistProfile() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    apiRequest<DentistMeDto>("/api/dentists/me")
      .then((me) => {
        if (active) setState({ status: "ready", me });
      })
      .catch((err: unknown) => {
        if (active) setState({ status: "error", message: apiErrorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser din profil …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Profilen kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  const { me } = state;

  function onClinicSaved(clinic: ClinicDto) {
    setState((prev) => (prev.status === "ready" ? { status: "ready", me: { ...prev.me, clinic } } : prev));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">Din profil</h2>
          <div>
            {me.isVerified ? <Badge tone="brand">Verificeret</Badge> : <Badge tone="warning">Afventer verifikation</Badge>}
          </div>
        </div>

        {me.isVerified ? (
          <Alert tone="success" title="Din profil er verificeret">
            <p>Din autorisation er kontrolleret. Du kan modtage og svare på forespørgsler, der matcher din profil.</p>
          </Alert>
        ) : (
          <Alert tone="warning" title="Din profil afventer verifikation">
            <p>
              Din autorisation er endnu ikke kontrolleret af en administrator. Du kan udfylde din klinik nu, men du
              modtager først forespørgsler, når din profil er verificeret.
            </p>
          </Alert>
        )}

        <DefinitionList
          items={[
            { label: "Navn", value: me.fullName },
            { label: "Autorisations-ID", value: me.authorizationId },
          ]}
        />
        <p className="text-sm leading-relaxed text-ink-muted">
          Autorisations-ID kan kun ændres af en administrator. Kontakt TandMatch, hvis oplysningerne er forkerte.
        </p>
      </Card>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Klinik</h2>
          <p className="text-base leading-relaxed text-ink-muted">
            {me.clinic
              ? "Klinikken vises for patienter, der søger en tandlæge i dit område."
              : "Du har ikke oprettet en klinik endnu. Udfyld felterne for at oprette den. Klinikken er knyttet til dig, og kun du kan redigere den."}
          </p>
        </div>
        <ClinicForm clinic={me.clinic} onSaved={onClinicSaved} />
      </Card>
    </div>
  );
}
