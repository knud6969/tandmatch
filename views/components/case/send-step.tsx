"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { ClinicListDto, ClinicListItemDto } from "@/lib/types/clinics";
import type { ConsentDto } from "@/lib/types/consents";
import type { PatientLeadDto } from "@/lib/types/leads";
import { PatientSignupForm } from "@/views/components/auth/patient-signup-form";
import { ConsentGate, hasActiveConsent } from "@/views/components/case/consent-gate";
import { PRICE_SOURCE } from "@/views/components/clinic-directory/clinic-facts";
import { useSession } from "@/views/components/session/session-provider";
import { AnonymousPatientBanner } from "@/views/components/session/anonymous-patient-banner";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { caseHref, clinicsHref, UUID } from "@/views/utils/case-links";
import { writeSelection } from "@/views/utils/compare-selection";
import { formatPriceRange } from "@/views/utils/format";
import { loadCaseSelection, type CaseSelectionContext } from "@/views/utils/use-case-selection";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

type Loaded = { ctx: CaseSelectionContext; clinics: ClinicListItemDto[] };

const loadConsents = async (): Promise<ConsentDto[]> => (await apiRequest<{ consents: ConsentDto[] }>("/api/consents")).consents;

// Klinik-id'erne fra ?klinikker= (kommasepareret). Ugyldige og dobbelte id'er fjernes.
function parseClinicIds(value: string | null): string[] {
  return [...new Set((value ?? "").split(",").filter((id) => UUID.test(id)))];
}

function ClinicLine({ clinic, hasServices }: { clinic: ClinicListItemDto; hasServices: boolean }) {
  return (
    <li className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4" data-testid="valgt-klinik">
      <p className="text-base font-semibold text-ink">{clinic.name}</p>
      <p className="text-sm text-ink-muted">
        {clinic.address}, {clinic.postalCode} {clinic.city}
      </p>
      <p className="text-sm text-ink">
        {clinic.priceForSelection ? (
          <>
            <span className="font-semibold">{formatPriceRange(clinic.priceForSelection.min, clinic.priceForSelection.max)}</span>{" "}
            <span className="text-ink-muted">for dit valg, {PRICE_SOURCE}</span>
          </>
        ) : (
          <span className="text-ink-muted">
            {hasServices ? "Prisen for dit valg er ikke angivet i klinikkens prisliste" : "Ingen pris for dit valg"}
          </span>
        )}
      </p>
    </li>
  );
}

// Afsendelse til de valgte klinikker (architecture 6.1, 10.5): konto (inline for en anonym patient, så sagen følger med),
// samtykke til deling af helbredsdata og send. Klinikken ser først patientens navn og kontaktoplysninger, når leadet er
// accepteret og en tid er booket.
export function SendStep({ caseId, clinicsParam }: { caseId: string; clinicsParam: string | null }) {
  const ids = parseClinicIds(clinicsParam);
  const { state } = useSession();
  const loader = useCallback(async (): Promise<Loaded> => {
    const ctx = await loadCaseSelection(caseId);
    const slugs = ctx.caseDto.services.map((s) => s.slug).join(",");
    const list = await apiRequest<ClinicListDto>(`/api/clinics${slugs ? `?services=${slugs}` : ""}`);
    return { ctx, clinics: list.clinics };
  }, [caseId]);
  const loaded = useLoad(loader);
  const consents = useLoad(loadConsents);
  const [grantedNow, setGrantedNow] = useState(false);
  const [sent, setSent] = useState<PatientLeadDto[] | null>(null);
  const send = useAction();

  const me = state.status === "ready" ? state.me : null;
  const backHref = loaded.data ? clinicsHref(loaded.data.ctx.caseDto) : `/klinikker?sag=${caseId}`;

  if (sent) {
    return (
      <div className="flex flex-col gap-4" data-testid="afsendt">
        <Alert tone="success" title="Din sag er sendt">
          <p>
            Vi har sendt din godkendte beskrivelse til {sent.length} klinik{sent.length === 1 ? "" : "ker"}. Du kan trække en henvendelse
            tilbage, indtil klinikken har svaret. Klinikken laver den endelige vurdering og svarer dig her på TandMatch.
          </p>
        </Alert>
        <ul className="flex flex-col gap-2">
          {sent.map((lead) => (
            <li key={lead.id} className="rounded-card border border-line bg-surface p-4 text-base font-semibold text-ink">
              {lead.clinic.name}
              <span className="block text-sm font-normal text-ink-muted">{lead.clinic.city}</span>
            </li>
          ))}
        </ul>
        <LinkButton href={caseHref(caseId)} fullWidth>
          Se din sag
        </LinkButton>
      </div>
    );
  }

  if (loaded.error || loaded.loading || !loaded.data || state.status === "loading" || consents.loading) {
    return <LoadState loading={!loaded.error} error={loaded.error} onRetry={loaded.reload} />;
  }

  const { ctx, clinics } = loaded.data;
  const caseDto = ctx.caseDto;
  const chosen = ids.map((id) => clinics.find((c) => c.id === id));
  const chosenClinics = chosen.filter((c): c is ClinicListItemDto => c !== undefined);

  // Hvorfor sagen ikke kan sendes lige nu, og hvad patienten kan gøre i stedet.
  let blocked: { title: string; text: string; link: { href: string; label: string } } | null = null;
  if (caseDto.status === "closed") {
    blocked = { title: "Sagen er lukket", text: "En lukket sag kan ikke sendes til flere klinikker.", link: { href: caseHref(caseId), label: "Se din sag" } };
  } else if (ids.length === 0) {
    blocked = { title: "Du har ikke valgt nogen klinikker", text: "Vælg de klinikker, du vil kontakte, i oversigten.", link: { href: backHref, label: "Vælg klinikker" } };
  } else if (ctx.slots === 0) {
    blocked = { title: "Du kan ikke kontakte flere klinikker lige nu", text: "Sagen har allerede det højeste antal aktive henvendelser. Trækker du en tilbage, bliver der plads.", link: { href: caseHref(caseId), label: "Gå til din sag" } };
  } else if (!caseDto.canSend) {
    blocked = { title: "Din sag er ikke klar til at blive sendt", text: "Godkend opsummeringen, og angiv behandlinger, tidsrum og postnummer.", link: { href: `/start/${caseId}`, label: "Tilbage til din sag" } };
  } else if (ids.length > ctx.slots) {
    blocked = { title: "Du har valgt for mange klinikker", text: `Du kan højst kontakte ${ctx.slots} klinik${ctx.slots === 1 ? "" : "ker"} mere med denne sag.`, link: { href: backHref, label: "Ret dit valg" } };
  } else if (ids.some((id) => ctx.contactedIds.includes(id))) {
    blocked = { title: "Du har allerede kontaktet en af klinikkerne", text: "En klinik kan kun kontaktes én gang pr. sag. Vælg en anden.", link: { href: backHref, label: "Ret dit valg" } };
  } else if (chosenClinics.length !== ids.length || chosenClinics.some((c) => !c.canReceiveLeads)) {
    blocked = { title: "En af klinikkerne kan ikke kontaktes", text: "Kun verificerede klinikker kan modtage henvendelser via TandMatch.", link: { href: backHref, label: "Ret dit valg" } };
  }
  if (blocked) {
    return (
      <Alert tone="warning" title={blocked.title}>
        <p>{blocked.text}</p>
        <Link href={blocked.link.href} className="mt-2 inline-block font-semibold text-brand-700">
          {blocked.link.label}
        </Link>
      </Alert>
    );
  }

  const anonymous = me?.isAnonymous === true;
  const consentGiven = grantedNow || (consents.data !== null && hasActiveConsent(consents.data, "health_data_sharing"));
  const hasServices = caseDto.services.length > 0;

  async function sendCase() {
    await send.run(async () => {
      const result = await apiRequest<{ leads: PatientLeadDto[] }>(`/api/cases/${caseId}/leads`, {
        method: "POST",
        body: { clinicIds: ids },
      });
      writeSelection(caseId, []);
      setSent(result.leads);
      window.scrollTo?.({ top: 0 });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <AnonymousPatientBanner />

      <section aria-labelledby="valgte" className="flex flex-col gap-3">
        <h2 id="valgte" className="text-xl font-semibold text-ink">
          Du sender til {chosenClinics.length} klinik{chosenClinics.length === 1 ? "" : "ker"}
        </h2>
        <ul className="flex flex-col gap-3">
          {chosenClinics.map((clinic) => (
            <ClinicLine key={clinic.id} clinic={clinic} hasServices={hasServices} />
          ))}
        </ul>
        <Link href={backHref} className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
          Ret dit valg
        </Link>
      </section>

      <Alert tone="info" title="Det deler vi med klinikkerne">
        <p>
          Din godkendte opsummering, dine bekræftede behandlinger, dit ønskede tidsrum, dit postnummer og de billeder, du har vedhæftet.
          Din chat med AI-assistenten deles ikke. Klinikken ser først dit navn og dine kontaktoplysninger, når den har accepteret, og en tid
          er booket. Klinikken laver den endelige vurdering, og priserne er klinikkens egne.
        </p>
      </Alert>

      {anonymous ? (
        <Card className="flex flex-col gap-4 sm:p-6" aria-labelledby="opret-konto">
          <h2 id="opret-konto" className="text-xl font-semibold text-ink">
            Opret en konto for at sende
          </h2>
          <PatientSignupForm onDone={() => consents.reload()} />
        </Card>
      ) : !consentGiven ? (
        <Card className="flex flex-col gap-4 sm:p-6" aria-labelledby="del-samtykke">
          <h2 id="del-samtykke" className="text-xl font-semibold text-ink">
            Samtykke til at dele din beskrivelse
          </h2>
          <ConsentGate type="health_data_sharing" onGranted={() => setGrantedNow(true)} actionLabel="Giv samtykke" />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <StatusMessage message={send.message} />
          <Button fullWidth onClick={sendCase} disabled={send.busy}>
            {send.busy ? "Sender …" : `Send til ${chosenClinics.length} klinik${chosenClinics.length === 1 ? "" : "ker"}`}
          </Button>
          <p className="text-sm text-ink-muted">Du kan trække en henvendelse tilbage, indtil klinikken har svaret.</p>
        </div>
      )}
    </div>
  );
}
