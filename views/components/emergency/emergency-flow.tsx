"use client";

import { useEffect, useState, type ReactNode } from "react";
import { hasCurrentConsent } from "@/lib/domain/consents";
import type { EmergencyLeadCreatedDto } from "@/lib/types/leads";
import type { PatientMeDto } from "@/lib/types/patients";
import { EmergencyAccountStep } from "@/views/components/emergency/emergency-account-step";
import { EmergencyClinicStep, type EmergencyChoice, type EmergencySearch } from "@/views/components/emergency/emergency-clinic-step";
import { EmergencyNotice } from "@/views/components/emergency/emergency-notice";
import { EmergencySendStep, type EmergencyDetails } from "@/views/components/emergency/emergency-send-step";
import { useSession } from "@/views/components/session/session-provider";
import { Alert } from "@/views/components/ui/alert";
import { LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { SLOT_TAKEN_TEXT } from "@/lib/constants/error-texts";
import { apiRequest } from "@/views/utils/api-client";
import { caseHref } from "@/views/utils/case-links";
import { loadConsents } from "@/views/utils/consents";
import { formatDateTime, formatTime } from "@/views/utils/format";

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 sm:p-6" aria-labelledby={`akut-trin-${number}`}>
      <h2 id={`akut-trin-${number}`} className="text-xl font-semibold text-ink">
        <span className="mr-2 inline-flex size-8 items-center justify-center rounded-pill bg-brand-600 text-base text-on-brand" aria-hidden="true">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

// Akutvejen (architecture 6.1 `/akut`, 10.11): tre trin på én side. Al tilstand ligger her, så login og kontooprettelse ikke
// mister valget af klinik, tid eller den skrevne beskrivelse. Ingen AI.
export function EmergencyFlow() {
  const { state } = useSession();
  const me = state.status === "ready" ? state.me : null;
  const [search, setSearch] = useState<EmergencySearch>({ serviceId: null, postalCode: "", position: null, clinic: null });
  const [slot, setSlot] = useState<EmergencyChoice["slot"] | null>(null);
  const [details, setDetails] = useState<EmergencyDetails>({ description: "", name: null, phone: null });
  const [profile, setProfile] = useState<PatientMeDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<EmergencyLeadCreatedDto | null>(null);
  // Hentes én gang pr. patient: forudfylder postnummer, navn og telefon.
  const permanentPatient = me?.role === "patient" && !me.isAnonymous;
  useEffect(() => {
    if (!permanentPatient) return;
    let active = true;
    apiRequest<PatientMeDto>("/api/patients/me").then(
      (dto) => {
        if (!active) return;
        setProfile(dto);
        setSearch((current) => (current.postalCode === "" && current.position === null && dto.postalCode ? { ...current, postalCode: dto.postalCode } : current));
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [permanentPatient]);

  // Gældende delingssamtykke (null = hentes). Hentes, når patienten har en permanent konto.
  const [consentOk, setConsentOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!permanentPatient) return;
    let active = true;
    loadConsents().then(
      (consents) => active && setConsentOk(hasCurrentConsent(consents, "health_data_sharing")),
      () => active && setConsentOk(false),
    );
    return () => {
      active = false;
    };
  }, [permanentPatient]);

  const [chosenService, setChosenService] = useState<EmergencyChoice["service"] | null>(null);
  const choice: EmergencyChoice | null = search.clinic && chosenService && slot ? { clinic: search.clinic, service: chosenService, slot } : null;

  if (created) {
    const booking = created.lead.booking;
    return (
      <div className="flex flex-col gap-4" data-testid="akut-sendt">
        <Alert tone="success" title="Tiden er reserveret til dig">
          <p>
            Vi har sendt din henvendelse til {created.lead.clinic.name}
            {booking ? ` og reserveret ${formatDateTime(booking.startsAt)}` : ""}.
          </p>
          {booking?.holdExpiresAt && (
            <p className="mt-2 font-semibold" data-testid="reservation-udloeb">
              Reservationen gælder til kl. {formatTime(booking.holdExpiresAt)}.
            </p>
          )}
          <p className="mt-2">
            Svarer klinikken ikke inden da, eller afviser den, frigives tiden, og du kan vælge en anden klinik. Klinikken laver den endelige
            vurdering og svarer dig her på TandMatch.
          </p>
        </Alert>
        <EmergencyNotice />
        <LinkButton href={caseHref(created.caseId)} fullWidth>
          Se din sag
        </LinkButton>
      </div>
    );
  }

  const onSearch = (patch: Partial<EmergencySearch>) => {
    setSearch((current) => ({ ...current, ...patch }));
    if ("clinic" in patch || "serviceId" in patch) setSlot(null);
    if ("serviceId" in patch) setChosenService(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <EmergencyNotice />
      <Step number={1} title="Vælg klinik og tid">
        {choice ? (
          <p className="text-base text-ink" data-testid="akut-valgt">
            <span className="font-semibold">{choice.clinic.name}</span>, {formatDateTime(choice.slot.startsAt)}
          </p>
        ) : (
          <EmergencyClinicStep
            search={search}
            onSearch={(patch) => {
              setNotice(null);
              onSearch(patch);
            }}
            onChoose={(next) => {
              setNotice(null);
              setChosenService(next.service);
              setSlot(next.slot);
              window.scrollTo?.({ top: 0 });
            }}
            notice={notice}
          />
        )}
      </Step>
      {choice && (
        <Step number={2} title="Konto og samtykke">
          <EmergencyAccountStep consentOk={permanentPatient ? consentOk : null} onConsent={() => setConsentOk(true)} />
        </Step>
      )}
      {choice && permanentPatient && consentOk && (
        <Step number={3} title="Send og reservér tiden">
          <EmergencySendStep
            choice={choice}
            postalCode={search.postalCode}
            profile={profile}
            details={details}
            onDetails={(patch) => setDetails((current) => ({ ...current, ...patch }))}
            onSent={(result) => {
              setCreated(result);
              window.scrollTo?.({ top: 0 });
            }}
            onSlotLost={() => {
              setSlot(null);
              setNotice(SLOT_TAKEN_TEXT);
              window.scrollTo?.({ top: 0 });
            }}
            onChangeChoice={() => setSlot(null)}
          />
        </Step>
      )}
    </div>
  );
}
