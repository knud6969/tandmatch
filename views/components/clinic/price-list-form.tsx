"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Card } from "@/views/components/ui/card";
import { TextField } from "@/views/components/ui/text-field";
import { LoadState } from "@/views/components/clinic/load-state";
import { SaveBar } from "@/views/components/clinic/save-bar";
import { useLoad } from "@/views/components/clinic/use-load";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { parseWholeKr } from "@/views/utils/format";
import { PRICE_NOTE_MAX_CHARS, SERVICE_DURATION_MAX_MINUTES, SERVICE_DURATION_MIN_MINUTES } from "@/lib/constants/clinics";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABEL } from "@/lib/constants/services";
import { putPricesSchema } from "@/lib/schemas/clinics";
import type { ClinicPriceDto } from "@/lib/types/clinics";
import type { ServiceDto } from "@/lib/types/services";

type Row = { on: boolean; min: string; max: string; duration: string; note: string };
type Rows = Record<string, Row>;
type Loaded = { services: ServiceDto[]; prices: ClinicPriceDto[] };

async function loadAll(): Promise<Loaded> {
  const [services, prices] = await Promise.all([
    apiRequest<{ services: ServiceDto[] }>("/api/services"),
    apiRequest<{ prices: ClinicPriceDto[] }>("/api/clinics/me/prices"),
  ]);
  return { services: services.services, prices: prices.prices };
}

function toRows(services: ServiceDto[], prices: ClinicPriceDto[]): Rows {
  const rows: Rows = {};
  for (const service of services) {
    const price = prices.find((p) => p.serviceId === service.id);
    rows[service.id] = price
      ? {
          on: true,
          min: String(price.price.min),
          max: String(price.price.max),
          duration: String(price.durationMin),
          note: price.note ?? "",
        }
      : { on: false, min: "", max: "", duration: String(service.defaultDurationMin), note: "" };
  }
  return rows;
}

// Prisliste pr. ydelse i kataloget (architecture 10.4, 10.8). Klinikken sætter flueben ved de ydelser, den tilbyder,
// og angiver prisinterval og varighed. Varigheden er forudfyldt med katalogets standardvarighed.
export function PriceListForm() {
  const { data, error, loading, reload } = useLoad(loadAll);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <PriceEditor services={data.services} initialPrices={data.prices} />;
}

function PriceEditor({ services, initialPrices }: { services: ServiceDto[]; initialPrices: ClinicPriceDto[] }) {
  const [saved, setSaved] = useState(() => toRows(services, initialPrices));
  const [rows, setRows] = useState(saved);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const offered = services.filter((s) => rows[s.id]?.on).length;

  function update(id: string, patch: Partial<Row>) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const prices: Array<{ serviceId: string; priceMin: number; priceMax: number; durationMin: number; note: string }> = [];
    for (const service of services) {
      const row = rows[service.id];
      if (!row.on) continue;
      const min = parseWholeKr(row.min);
      // Tom "til"-pris betyder samme pris som "fra".
      const max = row.max.trim() === "" ? min : parseWholeKr(row.max);
      const duration = parseWholeKr(row.duration);
      if (min === null || max === null) {
        errors[service.id] = "Angiv prisen i hele kroner.";
        continue;
      }
      if (duration === null) {
        errors[service.id] = "Angiv varigheden i hele minutter.";
        continue;
      }
      prices.push({ serviceId: service.id, priceMin: min, priceMax: max, durationMin: duration, note: row.note });
    }
    const parsed = putPricesSchema.safeParse({ prices });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const index = issue.path[0] === "prices" ? issue.path[1] : undefined;
        const serviceId = typeof index === "number" ? prices[index]?.serviceId : undefined;
        if (serviceId && !errors[serviceId]) errors[serviceId] = issue.message;
      }
    }
    setRowErrors(errors);
    if (Object.keys(errors).length > 0 || !parsed.success) {
      setSaveError("Ret ydelserne markeret med rødt.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const result = await apiRequest<{ prices: ClinicPriceDto[] }>("/api/clinics/me/prices", {
        method: "PUT",
        body: parsed.data,
      });
      const next = toRows(services, result.prices);
      setSaved(next);
      setRows(next);
      setSavedAt(new Date());
    } catch (e) {
      setSaveError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <Alert tone="info">
        Sæt flueben ved de ydelser, klinikken tilbyder, og angiv et prisinterval. Patienter ser priserne mærket
        “ifølge klinikkens prisliste”, og varigheden bruges til at finde ledige tider. Du kan altid rette senere.
      </Alert>

      {SERVICE_CATEGORIES.map((category) => {
        const inCategory = services.filter((s) => s.category === category);
        if (inCategory.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`kat-${category}`} className="flex flex-col gap-3">
            <h2 id={`kat-${category}`} className="text-xl font-semibold text-ink">
              {SERVICE_CATEGORY_LABEL[category]}
            </h2>
            <ul className="grid gap-3">
              {inCategory.map((service) => {
                const row = rows[service.id];
                const error = rowErrors[service.id];
                return (
                  <li key={service.id}>
                    <Card className={`flex flex-col gap-4 p-4 sm:p-5 ${row.on ? "border-brand-300" : ""}`}>
                      <label className="flex min-h-12 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={row.on}
                          onChange={(e) => update(service.id, { on: e.target.checked })}
                          className="mt-1 size-5 shrink-0 accent-brand-600"
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-base font-semibold text-ink">
                            {service.name} {row.on && <Badge tone="brand">Tilbydes</Badge>}
                          </span>
                          <span className="text-sm text-ink-muted">{service.description}</span>
                        </span>
                      </label>
                      {row.on && error && (
                        <p role="alert" className="text-sm font-medium text-danger-ink">
                          {error}
                        </p>
                      )}
                      {row.on && (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                          <TextField
                            label="Pris fra (kr.)"
                            inputMode="numeric"
                            autoComplete="off"
                            value={row.min}
                            onChange={(e) => update(service.id, { min: e.target.value })}
                          />
                          <TextField
                            label="Pris til (kr.)"
                            inputMode="numeric"
                            autoComplete="off"
                            value={row.max}
                            onChange={(e) => update(service.id, { max: e.target.value })}
                          />
                          <div className="col-span-2 sm:col-span-1">
                            <TextField
                              label="Varighed (min.)"
                              inputMode="numeric"
                              autoComplete="off"
                              hint={`${SERVICE_DURATION_MIN_MINUTES}-${SERVICE_DURATION_MAX_MINUTES} min.`}
                              value={row.duration}
                              onChange={(e) => update(service.id, { duration: e.target.value })}
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-3">
                            <TextField
                              label="Note (valgfri)"
                              placeholder="Fx inkl. 2 røntgenbilleder"
                              maxLength={PRICE_NOTE_MAX_CHARS}
                              value={row.note}
                              onChange={(e) => update(service.id, { note: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <SaveBar
        dirty={dirty}
        saving={saving}
        savedAt={savedAt}
        error={saveError}
        label={`Gem prisliste (${offered} ${offered === 1 ? "ydelse" : "ydelser"})`}
      />
    </form>
  );
}
