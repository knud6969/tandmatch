"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
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
import { caseDirectoryHref, caseFlowHref, caseHref, clinicsHref } from "@/views/utils/case-links";
import { isUuid } from "@/views/utils/ids";
import { writeSelection } from "@/views/utils/compare-selection";
import { formatPriceRange } from "@/views/utils/format";
import { loadCaseSelection, noSlotsText, type CaseSelectionContext } from "@/views/utils/use-case-selection";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

type Loaded = { ctx: CaseSelectionContext; clinics: ClinicListItemDto[] };

const loadConsents = async (): Promise<ConsentDto[]> => (await apiRequest<{ consents: ConsentDto[] }>("/api/consents")).consents;

// Klinik-id'erne fra ?klinikker= (kommasepareret). Ugyldige og dobbelte id'er fjernes.
function clinicIdsKey(value: string | null): string {
  return [...new Set((value ?? "").split(",").filter(isUuid))].join(",");
}

// Sagen og kun de valgte klinikker (API'et tager højst lige så mange, som en sag kan have aktive). Behandlingerne følger med
// for at få prisen for patientens valg. For mange valgte fanges af kontrollen i SendStep.
async function loadSendData(caseId: string, idsKey: string): Promise<Loaded> {
  const ctx = await loadCaseSelection(caseId);
  if (idsKey === "") return { ctx, clinics: [] };
  const params = new URLSearchParams({ ids: idsKey.split(",").slice(0, MAX_ACTIVE_LEADS_PER_CASE).join(",") });
  const slugs = ctx.caseDto.services.map((service) => service.slug).join(",");
  if (slugs) params.set("services", slugs);
  const list = await apiRequest<ClinicListDto>(`/api/clinics?${params.toString()}`);
  return { ctx, clinics: list.clinics };
}

function ClinicLine({ clinic }: { clinic: ClinicListItemDto }) {
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
          <span className="text-ink-muted">Prisen for dit valg er ikke angivet i klinikkens prisliste</span>
        )}
      </p>
    </li>
  );
}

// Afsendelse til de valgte klinikker (architecture 6.1, 10.5): konto (inline for en anonym patient, så sagen følger med),
// samtykke til deling af helbredsdata og send. Klinikken ser først patientens navn og kontaktoplysninger, når leadet er
// accepteret og en tid er booket.
export function SendStep({ caseId, clinicsParam }: { caseId: string; clinicsParam: string | null }) {
  const { state } = useSession();
  const idsKey = clinicIdsKey(clinicsParam);
  const loader = useCallback(() => loadSendData(caseId, idsKey), [caseId, idsKey]);
  const loaded = useLoad(loader);
  const consents = useLoad(loadConsents);
  const [grantedNow, setGrantedNow] = useState(false);
  const [sent, setSent] = useState<PatientLeadDto[] | null>(null);
  const send = useAction();

  const ids = idsKey === "" ? [] : idsKey.split(",");
  const me = state.status === "ready" ? state.me : null;
  const backHref = loaded.data ? clinicsHref(loaded.data.ctx.caseDto) : caseDirectoryHref(caseId);

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
    blocked = { title: "Du kan ikke kontakte flere klinikker lige nu", text: noSlotsText(ctx.totalLimitReached), link: { href: caseHref(caseId), label: "Gå til din sag" } };
  } else if (!caseDto.canSend) {
    blocked = { title: "Din sag er ikke klar til at blive sendt", text: "Godkend opsummeringen, og angiv behandlinger, tidsrum og postnummer.", link: { href: caseFlowHref(caseId), label: "Tilbage til din sag" } };
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
            <ClinicLine key={clinic.id} clinic={clinic} />
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
