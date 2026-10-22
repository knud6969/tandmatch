"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { LoadState } from "@/components/ui/load-state";
import { SaveBar } from "@/components/ui/save-bar";
import { TextField } from "@/components/ui/text-field";
import { ServiceGroupPicker } from "@/views/components/clinic/service-group-picker";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { loadServiceGroups } from "@/views/utils/clinic-loaders";
import { parseWholeKr } from "@/platform/ui-utils/format";
import { useLoad } from "@/platform/ui-utils/use-load";
import { useSaveState } from "@/platform/ui-utils/use-save-state";
import { PRICE_NOTE_MAX_CHARS, SERVICE_DURATION_MAX_MINUTES, SERVICE_DURATION_MIN_MINUTES } from "@/lib/constants/clinics";
import { putPricesSchema } from "@/lib/schemas/clinics";
import type { ClinicPriceDto } from "@/lib/types/clinics";
import type { ServiceDto, ServiceGroupDto } from "@/lib/types/services";

type Row = { on: boolean; min: string; max: string; duration: string; note: string };
type Rows = Record<string, Row>;
type Loaded = { groups: ServiceGroupDto[]; groupIds: string[]; prices: ClinicPriceDto[] };

async function loadAll(): Promise<Loaded> {
  const [groups, selected, prices] = await Promise.all([
    loadServiceGroups(),
    apiRequest<{ groupIds: string[] }>("/api/clinics/me/service-groups"),
    apiRequest<{ prices: ClinicPriceDto[] }>("/api/clinics/me/prices"),
  ]);
  return { groups, groupIds: selected.groupIds, prices: prices.prices };
}

const emptyRow = (service: ServiceDto): Row => ({
  on: false,
  min: "",
  max: "",
  duration: String(service.defaultDurationMin),
  note: "",
});

function toRows(services: ServiceDto[], prices: ClinicPriceDto[]): Rows {
  const rows: Rows = {};
  for (const service of services) {
    const price = prices.find((p) => p.serviceId === service.id);
    rows[service.id] = price
      ? { on: true, min: String(price.price.min), max: String(price.price.max), duration: String(price.durationMin), note: price.note ?? "" }
      : emptyRow(service);
  }
  return rows;
}

// Prisliste i to trin (architecture 6.3, 10.4, 10.8): først vælger klinikken sine behandlingskategorier, derefter
// sætter den flueben, pris og varighed på behandlingerne i de valgte kategorier. Varigheden er forudfyldt fra kataloget.
export function PriceListForm() {
  const { data, error, loading, reload } = useLoad(loadAll);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <PriceEditor groups={data.groups} initialGroupIds={data.groupIds} initialPrices={data.prices} />;
}

type EditorProps = { groups: ServiceGroupDto[]; initialGroupIds: string[]; initialPrices: ClinicPriceDto[] };

function PriceEditor({ groups, initialGroupIds, initialPrices }: EditorProps) {
  const services = groups.flatMap((g) => g.services);
  const [savedGroupIds, setSavedGroupIds] = useState(initialGroupIds);
  const [groupIds, setGroupIds] = useState(initialGroupIds);
  const [savedRows, setSavedRows] = useState(() => toRows(services, initialPrices));
  const [rows, setRows] = useState(savedRows);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Kategorien, klinikken er ved at fravælge, mens den har priser (kræver bekræftelse).
  const [pendingRemoval, setPendingRemoval] = useState<ServiceGroupDto | null>(null);

  const selectionDirty = [...groupIds].sort().join() !== [...savedGroupIds].sort().join();
  const dirty = selectionDirty || JSON.stringify(rows) !== JSON.stringify(savedRows);
  const saveState = useSaveState(dirty);
  const selectedGroups = groups.filter((g) => groupIds.includes(g.id));
  const offered = selectedGroups.flatMap((g) => g.services).filter((s) => rows[s.id]?.on).length;

  const update = (id: string, patch: Partial<Row>) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  function removeGroup(group: ServiceGroupDto) {
    setGroupIds((ids) => ids.filter((id) => id !== group.id));
    setRows((current) => {
      const next = { ...current };
      for (const service of group.services) next[service.id] = emptyRow(service);
      return next;
    });
    setPendingRemoval(null);
  }

  function onToggleGroup(group: ServiceGroupDto, selected: boolean) {
    if (selected) {
      setGroupIds((ids) => [...ids, group.id]);
      return;
    }
    if (group.services.some((s) => rows[s.id]?.on)) setPendingRemoval(group);
    else removeGroup(group);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const prices: Array<{ serviceId: string; priceMin: number; priceMax: number; durationMin: number; note: string }> = [];
    for (const service of selectedGroups.flatMap((g) => g.services)) {
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
      saveState.setError("Ret behandlingerne markeret med rødt.");
      return;
    }
    await saveState.save(async () => {
      // Kategorierne gemmes først: priserne kræver valgte kategorier, og fravalg sletter priserne i kategorien.
      if (selectionDirty) {
        const result = await apiRequest<{ groupIds: string[] }>("/api/clinics/me/service-groups", {
          method: "PUT",
          body: { groupIds },
        });
        setSavedGroupIds(result.groupIds);
        setGroupIds(result.groupIds);
      }
      const result = await apiRequest<{ prices: ClinicPriceDto[] }>("/api/clinics/me/prices", {
        method: "PUT",
        body: parsed.data,
      });
      const next = toRows(services, result.prices);
      setSavedRows(next);
      setRows(next);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <Alert tone="info">
        Patienter ser priserne mærket “ifølge klinikkens prisliste”, og varigheden bruges til at finde ledige tider. Du kan
        altid rette senere.
      </Alert>

      <ServiceGroupPicker
        groups={groups}
        selectedIds={groupIds}
        onToggle={onToggleGroup}
        disabled={saveState.props.saving}
        confirmation={
          pendingRemoval && {
            groupId: pendingRemoval.id,
            content: (
              <Alert tone="warning" title={`Fravælg ${pendingRemoval.name}?`} role="alert">
                <p>
                  Priserne på behandlingerne i denne kategori slettes, når du gemmer. Du kan fortryde ved at beholde
                  kategorien, før du gemmer.
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  <Button variant="danger" onClick={() => removeGroup(pendingRemoval)}>
                    Ja, fravælg og slet priserne
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingRemoval(null)}>
                    Behold kategorien
                  </Button>
                </div>
              </Alert>
            ),
          }
        }
      />

      <section aria-labelledby="priser" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="priser" className="text-xl font-semibold text-ink">
            2. Sæt pris på behandlingerne
          </h2>
          {selectedGroups.length === 0 ? (
            <p className="text-base text-ink-muted">Vælg mindst én kategori ovenfor for at sætte priser.</p>
          ) : (
            <p className="text-base text-ink-muted">
              Sæt flueben ved de behandlinger, du tilbyder, og angiv prisen. Lader du “Pris til” stå tom, bruges samme pris
              som “Pris fra” (en fast pris).
            </p>
          )}
        </div>

        {selectedGroups.map((group) => (
          <section key={group.id} aria-labelledby={`kat-${group.id}`} className="flex flex-col gap-3">
            <h3 id={`kat-${group.id}`} className="text-lg font-semibold text-ink">
              {group.name}
            </h3>
            <ul className="grid gap-3">
              {group.services.map((service) => (
                <li key={service.id}>
                  <ServiceRow
                    service={service}
                    row={rows[service.id]}
                    error={rowErrors[service.id]}
                    onChange={(patch) => update(service.id, patch)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>

      <SaveBar
        {...saveState.props}
        label={`Gem prisliste (${offered} ${offered === 1 ? "behandling" : "behandlinger"})`}
      />
    </form>
  );
}

type ServiceRowProps = { service: ServiceDto; row: Row; error?: string; onChange: (patch: Partial<Row>) => void };

function ServiceRow({ service, row, error, onChange }: ServiceRowProps) {
  return (
    <div className="flex flex-col gap-4">
      <CheckboxField
        label={
          <>
            {service.name} {row.on && <Badge tone="brand">Tilbydes</Badge>}
          </>
        }
        description={service.description}
        selected={row.on}
        checked={row.on}
        onChange={(e) => onChange({ on: e.target.checked })}
      />
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
            onChange={(e) => onChange({ min: e.target.value })}
          />
          <TextField
            label="Pris til (kr.)"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Samme som fra"
            value={row.max}
            onChange={(e) => onChange({ max: e.target.value })}
          />
          <div className="col-span-2 sm:col-span-1">
            <TextField
              label="Varighed (min.)"
              inputMode="numeric"
              autoComplete="off"
              hint={`${SERVICE_DURATION_MIN_MINUTES}-${SERVICE_DURATION_MAX_MINUTES} min.`}
              value={row.duration}
              onChange={(e) => onChange({ duration: e.target.value })}
            />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <TextField
              label="Note (valgfri)"
              placeholder="Fx inkl. 2 røntgenbilleder"
              maxLength={PRICE_NOTE_MAX_CHARS}
              value={row.note}
              onChange={(e) => onChange({ note: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
