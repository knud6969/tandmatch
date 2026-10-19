"use client";

import Link from "next/link";
import { useCallback } from "react";
import { MAX_AVAILABILITY_RANGE_DAYS } from "@/lib/constants/bookings";
import { OUT_OF_HOURS_HELP_TEXT } from "@/lib/constants/emergency";
import { EMERGENCY_DEFAULT_SERVICE_SLUG } from "@/lib/constants/services";
import type { ClinicListDto, ClinicListItemDto, SlotDto } from "@/lib/types/clinics";
import type { ServiceDto } from "@/lib/types/services";
import { ClinicCard } from "@/views/components/clinic-directory/clinic-card";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { LoadState } from "@/views/components/ui/load-state";
import { SelectField } from "@/views/components/ui/select-field";
import { SlotDays } from "@/views/components/ui/slot-days";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { buildClinicsQuery, DEFAULT_FILTERS, isPostalCode } from "@/views/utils/clinic-query";
import { loadServiceGroups } from "@/views/utils/clinic-loaders";
import { usePosition, type Position } from "@/views/utils/use-position";
import { useLoad } from "@/views/utils/use-load";

// Søgningen i trin 1. Ligger i EmergencyFlow, så den overlever login og konto (architecture 6.1).
export type EmergencySearch = {
  serviceId: string | null;
  postalCode: string;
  position: Position | null;
  clinic: ClinicListItemDto | null;
};

export type EmergencyChoice = { clinic: ClinicListItemDto; service: ServiceDto; slot: SlotDto };

type Props = {
  search: EmergencySearch;
  onSearch: (patch: Partial<EmergencySearch>) => void;
  onChoose: (choice: EmergencyChoice) => void;
  // Fx at tiden blev optaget, mens patienten udfyldte oplysninger.
  notice: string | null;
};

// Trin 1: akutydelse, sted, klinikker med ledig akuttid og tider hos den valgte klinik. Offentligt, ingen login.
export function EmergencyClinicStep({ search, onSearch, onChoose, notice }: Props) {
  const groups = useLoad(loadServiceGroups);
  const services = (groups.data ?? []).flatMap((group) => group.services).filter((service) => service.category === "emergency");
  const service = services.find((s) => s.id === search.serviceId) ?? services.find((s) => s.slug === EMERGENCY_DEFAULT_SERVICE_SLUG) ?? services[0] ?? null;

  const geo = usePosition((position) => onSearch({ position, postalCode: "", clinic: null }));
  const postalInvalid = search.postalCode !== "" && !isPostalCode(search.postalCode);

  if (groups.loading || groups.error || !groups.data) {
    return <LoadState loading={groups.loading} error={groups.error} onRetry={groups.reload} />;
  }
  if (!service) {
    return (
      <Alert tone="warning" title="Der er ingen akutydelser lige nu">
        <p>{OUT_OF_HOURS_HELP_TEXT}</p>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <Alert tone="warning" role="alert">
          <p data-testid="akut-besked">{notice}</p>
        </Alert>
      )}

      {search.clinic === null ? (
        <>
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5">
            {services.length > 1 && (
              <SelectField label="Akutbehandling" value={service.id} onChange={(event) => onSearch({ serviceId: event.target.value })}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            )}
            {services.length === 1 && (
              <p className="text-base text-ink">
                <span className="text-ink-muted">Behandling: </span>
                <span className="font-semibold">{service.name}</span>
              </p>
            )}
            <TextField
              label="Postnummer"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={4}
              placeholder="fx 2100"
              value={search.postalCode}
              onChange={(event) => onSearch({ postalCode: event.target.value.replace(/\D/g, "").slice(0, 4), position: null })}
              error={postalInvalid ? "Postnummeret skal være fire cifre." : undefined}
            />
            <Button variant="secondary" onClick={geo.request} disabled={geo.locating}>
              {geo.locating ? "Finder position …" : "Brug min position"}
            </Button>
            {search.position && (
              <p className="text-sm text-ink-muted">
                Din position bruges til afstanden og gemmes ikke.{" "}
                <button type="button" className="min-h-11 font-semibold text-brand-700 underline" onClick={() => onSearch({ position: null })}>
                  Fjern
                </button>
              </p>
            )}
            {geo.error && (
              <p role="alert" className="text-sm font-medium text-danger-ink">
                {geo.error}
              </p>
            )}
          </div>
          <ClinicList service={service} search={search} onPick={(clinic) => onSearch({ clinic })} />
        </>
      ) : (
        <ClinicSlots
          clinic={search.clinic}
          service={service}
          onBack={() => onSearch({ clinic: null })}
          onPick={(slot) => onChoose({ clinic: search.clinic as ClinicListItemDto, service, slot })}
        />
      )}
    </div>
  );
}

// Klinikker med ledig akuttid, tidligste først. Samme filter og kort som oversigten.
function ClinicList({ service, search, onPick }: { service: ServiceDto; search: EmergencySearch; onPick: (clinic: ClinicListItemDto) => void }) {
  const postalCode = isPostalCode(search.postalCode) ? search.postalCode : "";
  const query = buildClinicsQuery({
    ...DEFAULT_FILTERS,
    serviceSlugs: [service.slug],
    postalCode,
    position: search.position,
    emergency: true,
    contactableOnly: true,
    sort: "first_available",
  });
  const loader = useCallback(() => apiRequest<ClinicListDto>(`/api/clinics?${query}`), [query]);
  const { data, loading, error, reload } = useLoad(loader);

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  if (data.clinics.length === 0) {
    return (
      <Alert tone="warning" title="Ingen klinikker med ledig akuttid" >
        <p data-testid="ingen-akuttid">
          Vi kan ikke finde en klinik med en ledig akuttid lige nu. {OUT_OF_HOURS_HELP_TEXT}
        </p>
        <Link href="/klinikker?akut=1" className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-700">
          Se alle klinikker i oversigten
        </Link>
      </Alert>
    );
  }
  return (
    <section aria-labelledby="akut-klinikker" className="flex flex-col gap-3">
      <h3 id="akut-klinikker" className="text-lg font-semibold text-ink">
        Klinikker med ledig akuttid
      </h3>
      <p className="text-sm text-ink-muted">Sorteret efter første ledige akuttid. {data.criteria.join(", ")}</p>
      <ul className="grid gap-4 sm:grid-cols-2" aria-busy={loading} data-testid="akut-klinikliste">
        {data.clinics.map((clinic) => (
          <ClinicCard
            key={clinic.id}
            clinic={clinic}
            hasServices
            emergency
            action={
              <Button variant="secondary" fullWidth onClick={() => onPick(clinic)}>
                Vælg tid
                <span className="sr-only"> hos {clinic.name}</span>
              </Button>
            }
          />
        ))}
      </ul>
    </section>
  );
}

// Ledige tider hos den valgte klinik for akutydelsen (architecture 6.7).
function ClinicSlots({ clinic, service, onBack, onPick }: { clinic: ClinicListItemDto; service: ServiceDto; onBack: () => void; onPick: (slot: SlotDto) => void }) {
  const loader = useCallback(
    async () => (await apiRequest<{ slots: SlotDto[] }>(`/api/clinics/${clinic.id}/availability?serviceId=${encodeURIComponent(service.id)}`)).slots,
    [clinic.id, service.id],
  );
  const { data, loading, error, reload } = useLoad(loader);

  return (
    <section aria-labelledby="akut-tider" className="flex flex-col gap-4" data-testid="akut-tider">
      <div className="flex flex-col gap-1">
        <h3 id="akut-tider" className="text-lg font-semibold text-ink">
          Vælg en tid hos {clinic.name}
        </h3>
        <p className="text-sm text-ink-muted">
          {clinic.address}, {clinic.postalCode} {clinic.city} · {service.name}
        </p>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.length === 0 && (
        <p className="text-base text-ink-muted">{`Ingen ledige tider de næste ${MAX_AVAILABILITY_RANGE_DAYS} dage. Vælg en anden klinik.`}</p>
      )}
      {data && data.length > 0 && <SlotDays slots={data} maxDays={5} selected={null} onSelect={onPick} />}
      <div>
        <Button variant="secondary" onClick={onBack}>
          Vælg en anden klinik
        </Button>
      </div>
    </section>
  );
}
