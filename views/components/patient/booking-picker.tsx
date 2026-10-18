"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import {
  BOOKING_HORIZON_DAYS,
  MAX_AVAILABILITY_RANGE_DAYS,
} from "@/lib/constants/bookings";
import { DAY_MS } from "@/lib/domain/time";
import { contactNameSchema } from "@/lib/schemas/bookings";
import { phoneSchema } from "@/lib/schemas/phone";
import type { PatientBookingDto } from "@/lib/types/bookings";
import type { SlotDto } from "@/lib/types/clinics";
import type { PatientMeDto } from "@/lib/types/patients";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/ui/load-state";
import { SelectField } from "@/views/components/ui/select-field";
import { StatusMessage } from "@/views/components/ui/status-message";
import { TextField } from "@/views/components/ui/text-field";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { BOOKINGS_HREF, caseHref } from "@/views/utils/case-links";
import { formatDateTime, formatDayMonth } from "@/views/utils/format";
import { SlotDays } from "@/views/components/ui/slot-days";
import { loadCaseSelection } from "@/views/utils/use-case-selection";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

const FORM_ID = "booking-form";
const PAGES = Math.ceil(BOOKING_HORIZON_DAYS / MAX_AVAILABILITY_RANGE_DAYS);

// Tidsrummet for en side: side 0 starter nu, de følgende MAX_AVAILABILITY_RANGE_DAYS dage ad gangen.
function rangeOf(now: number, page: number): { from: Date; to: Date } {
  const from = new Date(now + page * MAX_AVAILABILITY_RANGE_DAYS * DAY_MS);
  return { from, to: new Date(from.getTime() + MAX_AVAILABILITY_RANGE_DAYS * DAY_MS) };
}

// Tidsvælger: ledige tider pr. dag, højst MAX_AVAILABILITY_RANGE_DAYS ad gangen, med mulighed for at bladre frem.
function SlotPicker({
  leadId,
  serviceId,
  selected,
  onSelect,
  reloadKey,
}: {
  leadId: string;
  serviceId: string;
  selected: string | null;
  onSelect: (slot: SlotDto | null) => void;
  reloadKey: number;
}) {
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState(0);
  const loader = useCallback(async () => {
    const { from, to } = rangeOf(now, page);
    const params = new URLSearchParams({ serviceId, from: from.toISOString(), to: to.toISOString() });
    // reloadKey ligger kun i afhængighederne, så tiderne hentes igen efter SLOT_TAKEN.
    void reloadKey;
    return (await apiRequest<{ slots: SlotDto[] }>(`/api/leads/${leadId}/availability?${params.toString()}`)).slots;
  }, [leadId, serviceId, page, now, reloadKey]);
  const { data, loading, error, reload } = useLoad(loader);

  function goTo(next: number) {
    setPage(next);
    onSelect(null);
  }

  const { from, to } = rangeOf(now, page);
  const lastDay = new Date(to.getTime() - 1);

  return (
    <div className="flex flex-col gap-4" data-testid="tidsvaelger">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Vælg en tid</h2>
        <p className="text-sm text-ink-muted" data-testid="tidsrum">
          {formatDayMonth(from)} til {formatDayMonth(lastDay)}
        </p>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.length === 0 && (
        <p className="text-base text-ink-muted" data-testid="ingen-tider">
          Ingen ledige tider i dette tidsrum. Prøv at bladre frem.
        </p>
      )}
      {data && data.length > 0 && <SlotDays slots={data} selected={selected} onSelect={onSelect} />}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => goTo(page - 1)} disabled={page === 0}>
          ← Tidligere dage
        </Button>
        <Button variant="secondary" onClick={() => goTo(page + 1)} disabled={page >= PAGES - 1}>
          Senere dage →
        </Button>
      </div>
    </div>
  );
}

type Loaded = {
  context: Awaited<ReturnType<typeof loadCaseSelection>>;
  me: PatientMeDto;
};

// Patientens booking af et accepteret lead (architecture 6.2, 10.10): vælg behandling og tid, bekræft navn og telefon, book.
export function BookingPicker({ caseId, leadId }: { caseId: string; leadId: string }) {
  const loader = useCallback(async (): Promise<Loaded> => {
    const [context, me] = await Promise.all([loadCaseSelection(caseId), apiRequest<PatientMeDto>("/api/patients/me")]);
    return { context, me };
  }, [caseId]);
  const { data, loading, error, reload } = useLoad(loader);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotDto | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [booked, setBooked] = useState<PatientBookingDto | null>(null);
  const action = useAction();

  const back = (
    <Link href={caseHref(caseId)} className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
      ← Din sag
    </Link>
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <LoadState loading={loading} error={error} onRetry={reload} />
      </div>
    );
  }

  const { context, me } = data;
  const lead = context.leads.find((l) => l.id === leadId);
  const services = context.caseDto.services;
  const currentService = serviceId ?? services[0]?.id ?? "";
  const currentName = name ?? me.firstName ?? "";
  const currentPhone = phone ?? me.phone ?? "";

  if (booked) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Din tid er booket</h1>
        <Alert tone="success" title={`${booked.service.name} hos ${booked.clinic.name}`}>
          <p data-testid="booking-bekraeftelse">
            {formatDateTime(booked.startsAt)} · {booked.clinic.address}, {booked.clinic.city}
          </p>
          <p className="mt-2">Klinikken kan nu se dit navn og telefonnummer. Klinikken laver den endelige vurdering af behandlingen og prisen, når du møder op.</p>
        </Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <LinkButton href={BOOKINGS_HREF}>Se mine bookinger</LinkButton>
          <LinkButton href={caseHref(caseId)} variant="secondary">
            Tilbage til sagen
          </LinkButton>
        </div>
      </div>
    );
  }

  if (!lead || lead.status !== "accepted") {
    const already = lead?.status === "booked";
    return (
      <div className="flex flex-col gap-4">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Book tid</h1>
        <Alert tone="info">
          <p>
            {already
              ? "Du har allerede en tid hos klinikken. Du kan se eller aflyse den under dine bookinger."
              : "Du kan kun booke, når klinikken har accepteret din henvendelse."}
          </p>
        </Alert>
        <div>
          <LinkButton href={already ? BOOKINGS_HREF : caseHref(caseId)} variant="secondary">
            {already ? "Se mine bookinger" : "Tilbage til sagen"}
          </LinkButton>
        </div>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slot) return;
    const errors: { name?: string; phone?: string } = {};
    const parsedName = contactNameSchema.safeParse(currentName);
    if (!parsedName.success) errors.name = parsedName.error.issues[0]?.message ?? "Skriv dit fulde navn.";
    if (!phoneSchema.safeParse(currentPhone).success) errors.phone = "Angiv et gyldigt telefonnummer, fx 12 34 56 78.";
    setFieldErrors(errors);
    if (errors.name || errors.phone) return;

    const chosen = slot;
    let result: PatientBookingDto | null = null;
    const ok = await action.run(async () => {
      try {
        result = await apiRequest<PatientBookingDto>(`/api/leads/${leadId}/booking`, {
          method: "POST",
          body: { serviceId: currentService, startsAt: chosen.startsAt, contactName: parsedName.data, contactPhone: currentPhone.trim() },
        });
      } catch (e) {
        // Tiden er væk eller ikke længere mulig: vælg på ny blandt friske tider.
        if (e instanceof ApiRequestError && (e.code === "SLOT_TAKEN" || e.code === "SLOT_UNAVAILABLE")) {
          setSlot(null);
          setReloadKey((k) => k + 1);
        }
        setLimitReached(e instanceof ApiRequestError && e.code === "BOOKING_LIMIT");
        throw e;
      }
    });
    if (ok && result) setBooked(result);
  }

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-0">
      {back}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Book tid hos {lead.clinic.name}</h1>
        <p className="text-base text-ink-muted">
          {lead.clinic.city}. Klinikken har accepteret din henvendelse. Vælg behandling og en ledig tid.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
        <Card className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
          <SelectField
            label="Behandling"
            value={currentService}
            onChange={(event) => {
              setServiceId(event.target.value);
              setSlot(null);
            }}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </SelectField>

          {currentService && (
            <SlotPicker
              leadId={leadId}
              serviceId={currentService}
              selected={slot?.startsAt ?? null}
              onSelect={setSlot}
              reloadKey={reloadKey}
            />
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
          <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Kontaktoplysninger og booking">
            <Card className="flex flex-col gap-4 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-ink">Dine oplysninger</h2>
              <p className="text-sm text-ink-muted">Klinikken ser dit navn og telefonnummer, når tiden er booket.</p>
              <TextField
                label="Fulde navn"
                name="contactName"
                autoComplete="name"
                value={currentName}
                onChange={(event) => setName(event.target.value)}
                error={fieldErrors.name}
                required
              />
              <TextField
                label="Telefon"
                name="contactPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={currentPhone}
                onChange={(event) => setPhone(event.target.value)}
                error={fieldErrors.phone}
                required
              />
            </Card>
            <StatusMessage message={action.message} />
            {limitReached && (
              <Link href={caseHref(caseId)} className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
                Gå til beskedtråden med klinikken
              </Link>
            )}
          </form>

          {/* Bundlinjen er fast i bunden af skærmen under lg (siden har bundpolstring, så intet skjules), så "Book tid" altid er inden for rækkevidde efter valg af tid. */}
          <div
            className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-raised sm:px-6 lg:static lg:rounded-card lg:border lg:px-4 lg:py-3 lg:shadow-card"
            data-testid="bundlinje"
          >
            <div className="min-w-0">
              {slot ? (
                <>
                  <p className="text-sm text-ink-muted">Valgt tid</p>
                  <p className="text-base font-semibold text-ink" data-testid="valgt-tid">
                    {formatDateTime(slot.startsAt)}
                  </p>
                </>
              ) : (
                <p className="text-base text-ink-muted">Vælg en tid for at booke.</p>
              )}
            </div>
            <Button type="submit" form={FORM_ID} disabled={!slot || !currentService || action.busy} className="shrink-0">
              {action.busy ? "Booker …" : "Book tid"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
