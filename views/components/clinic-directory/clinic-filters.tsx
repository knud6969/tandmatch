"use client";

import { useState, type FormEvent } from "react";
import { EMERGENCY_FILTER_HOURS, MAX_SELECTED_SERVICES } from "@/lib/constants/clinics";
import type { ServiceGroupDto } from "@/lib/types/services";
import { Button } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { cx } from "@/views/components/ui/cx";
import { SelectField } from "@/views/components/ui/select-field";
import { TextField } from "@/views/components/ui/text-field";
import { hasOrigin, isPostalCode, type DirectoryFilters } from "@/views/utils/clinic-query";
import { parseWholeKr } from "@/views/utils/format";
import { usePosition } from "@/views/utils/use-position";

const DISTANCES = [5, 10, 25, 50, 100] as const;
const STAR_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "3", label: "3 stjerner eller mere" },
  { value: "4", label: "4 stjerner eller mere" },
  { value: "4.5", label: "4,5 stjerner eller mere" },
] as const;

type ClinicFiltersProps = {
  filters: DirectoryFilters;
  onChange: (patch: Partial<DirectoryFilters>) => void;
  onReset: () => void;
  groups: ServiceGroupDto[] | null;
  activeCount: number;
};

// Filtrene i oversigten (architecture 6.6). Valg slår igennem med det samme; postnummer og pris, når feltet forlades eller
// der trykkes Enter. På mobil foldes panelet sammen bag en knap.
export function ClinicFilters({ filters, onChange, onReset, groups, activeCount }: ClinicFiltersProps) {
  const [open, setOpen] = useState(false);
  const [postalDraft, setPostalDraft] = useState(filters.postalCode);
  const [priceDraft, setPriceDraft] = useState(filters.maxPrice === null ? "" : String(filters.maxPrice));
  const geo = usePosition((position) => {
    setPostalDraft("");
    onChange({ position, postalCode: "" });
  });

  const hasServices = filters.serviceSlugs.length > 0;
  const priceInvalid = priceDraft.trim() !== "" && parseWholeKr(priceDraft) === null;
  const postalInvalid = postalDraft !== "" && !isPostalCode(postalDraft);
  const slugName = new Map((groups ?? []).flatMap((group) => group.services.map((service) => [service.slug, service.name] as const)));

  function toggleService(slug: string) {
    const next = filters.serviceSlugs.includes(slug)
      ? filters.serviceSlugs.filter((s) => s !== slug)
      : [...filters.serviceSlugs, slug];
    // Uden behandlinger kan der ikke filtreres på pris (API'et afviser det).
    onChange({ serviceSlugs: next, ...(next.length === 0 ? { maxPrice: null } : {}) });
    if (next.length === 0) setPriceDraft("");
  }

  function changePostal(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setPostalDraft(digits);
    if (digits === "" || isPostalCode(digits)) onChange({ postalCode: digits, position: null });
  }

  function commitPrice() {
    if (priceDraft.trim() === "") return onChange({ maxPrice: null });
    const value = parseWholeKr(priceDraft);
    if (value !== null) onChange({ maxPrice: value });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    commitPrice();
  }

  return (
    <form onSubmit={submit} aria-label="Filtre" className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Filtre{activeCount > 0 && <span className="text-ink-muted"> ({activeCount} valgt)</span>}</h2>
        <Button
          variant="secondary"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls="filter-felter"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Skjul filtre" : "Vis filtre"}
        </Button>
      </div>

      <div id="filter-felter" className={cx("mt-4 flex-col gap-5 lg:flex", open ? "flex" : "hidden")}>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <fieldset className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
            <legend className="text-sm font-semibold text-ink">Behandlinger (højst {MAX_SELECTED_SERVICES})</legend>
            {hasServices && (
              <ul className="flex flex-wrap gap-2" aria-label="Valgte behandlinger">
                {filters.serviceSlugs.map((slug) => (
                  <li key={slug}>
                    <button
                      type="button"
                      onClick={() => toggleService(slug)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-brand-600 px-4 text-sm font-semibold text-on-brand hover:bg-brand-700"
                    >
                      {slugName.get(slug) ?? slug}
                      <span aria-hidden="true">×</span>
                      <span className="sr-only">Fjern</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <details className="rounded-control border border-field-border bg-surface">
              <summary className="flex min-h-12 cursor-pointer items-center px-3.5 text-base text-ink">
                {hasServices ? "Ændr behandlinger" : "Vælg behandlinger"}
              </summary>
              <div className="max-h-72 overflow-y-auto border-t border-line p-3">
                {!groups ? (
                  <p className="text-sm text-ink-muted">Henter behandlinger …</p>
                ) : (
                  groups.map((group) => (
                    <fieldset key={group.id} className="mb-4 last:mb-0">
                      <legend className="mb-1 text-sm font-semibold text-ink-muted">{group.name}</legend>
                      <div className="flex flex-col">
                        {group.services.map((service) => {
                          const checked = filters.serviceSlugs.includes(service.slug);
                          const full = !checked && filters.serviceSlugs.length >= MAX_SELECTED_SERVICES;
                          return (
                            <label
                              key={service.id}
                              className={cx("flex min-h-11 items-center gap-3 rounded-control px-2 text-base", full ? "opacity-60" : "cursor-pointer hover:bg-brand-50")}
                            >
                              <input
                                type="checkbox"
                                className="size-5 accent-brand-600"
                                checked={checked}
                                disabled={full}
                                onChange={() => toggleService(service.slug)}
                              />
                              {service.name}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))
                )}
              </div>
            </details>
          </fieldset>

          <div className="flex flex-col gap-2">
            <TextField
              label="Postnummer"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={4}
              placeholder="fx 2100"
              value={postalDraft}
              onChange={(event) => changePostal(event.target.value)}
              error={postalInvalid ? "Postnummeret skal være fire cifre." : undefined}
            />
            <Button variant="secondary" onClick={geo.request} disabled={geo.locating}>
              {geo.locating ? "Finder position …" : "Brug min position"}
            </Button>
            {filters.position && (
              <p className="text-sm text-ink-muted">
                Din position bruges til afstanden og gemmes ikke.{" "}
                <button type="button" className="min-h-11 font-semibold text-brand-700 underline" onClick={() => onChange({ position: null })}>
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

          <div className="flex flex-col gap-5">
            <SelectField
              label="Højeste afstand"
              value={filters.maxDistanceKm}
              disabled={!hasOrigin(filters)}
              hint={hasOrigin(filters) ? undefined : "Angiv postnummer eller position."}
              onChange={(event) => onChange({ maxDistanceKm: Number(event.target.value) })}
            >
              {DISTANCES.map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <TextField
            label="Højeste pris i alt (kr.)"
            inputMode="numeric"
            placeholder="fx 1500"
            value={priceDraft}
            disabled={!hasServices}
            hint={hasServices ? "Summen af de valgte behandlinger, ifølge klinikkens prisliste." : "Vælg først en behandling."}
            onChange={(event) => setPriceDraft(event.target.value)}
            onBlur={commitPrice}
            error={priceInvalid ? "Skriv et helt beløb i kroner." : undefined}
          />
          <SelectField
            label="Mindst antal stjerner"
            hint="Gælder verificerede anmeldelser på TandMatch."
            value={filters.minStars === null ? "" : String(filters.minStars)}
            onChange={(event) => onChange({ minStars: event.target.value === "" ? null : Number(event.target.value) })}
          >
            {STAR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <CheckboxField
            label="Akut"
            description={`Kun klinikker med akuttid inden for ${EMERGENCY_FILTER_HOURS} timer`}
            selected={filters.emergency}
            checked={filters.emergency}
            onChange={(event) =>
              onChange({ emergency: event.target.checked, sort: event.target.checked ? "first_available" : null })
            }
          />
          <CheckboxField
            label="Kun klinikker, der kan kontaktes"
            description="Verificerede klinikker på TandMatch"
            selected={filters.contactableOnly}
            checked={filters.contactableOnly}
            onChange={(event) => onChange({ contactableOnly: event.target.checked })}
          />
        </div>

        {activeCount > 0 && (
          <div>
            <Button
              variant="ghost"
              onClick={() => {
                setPostalDraft("");
                setPriceDraft("");
                geo.clearError();
                onReset();
              }}
            >
              Nulstil filtre
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
