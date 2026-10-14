"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { EMERGENCY_FILTER_HOURS } from "@/lib/constants/clinics";
import type { ClinicListDto } from "@/lib/types/clinics";
import { CHAT_HREF, CHAT_READY } from "@/lib/navigation/entries";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { cx } from "@/views/components/ui/cx";
import { FilterChips } from "@/views/components/ui/filter-chips";
import { LoadState } from "@/views/components/ui/load-state";
import { ClinicCard } from "@/views/components/clinic-directory/clinic-card";
import { ClinicFilters } from "@/views/components/clinic-directory/clinic-filters";
import { ClinicMapLazy } from "@/views/components/clinic-directory/clinic-map-loader";
import { CompareBar, MAX_COMPARE, type CompareChoice } from "@/views/components/clinic-directory/compare-bar";
import { SortSelect } from "@/views/components/clinic-directory/sort-select";
import { apiRequest } from "@/views/utils/api-client";
import { loadServiceGroups } from "@/views/utils/clinic-loaders";
import { buildClinicsQuery, DEFAULT_FILTERS, hasOrigin, isPostalCode, type DirectoryFilters } from "@/views/utils/clinic-query";
import { useLoad } from "@/views/utils/use-load";

type Loaded = ClinicListDto & { query: string };
type MobileView = "list" | "map";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9_]{1,60}$/;

// Startfiltre fra adressen: ?akut=1 (forsidens "Jeg har ondt"), ?services=, ?postalCode=.
function initialFilters(params: URLSearchParams): DirectoryFilters {
  const emergency = params.get("akut") === "1";
  const postalCode = params.get("postalCode") ?? "";
  return {
    ...DEFAULT_FILTERS,
    emergency,
    sort: emergency ? "first_available" : null,
    serviceSlugs: (params.get("services") ?? "").split(",").filter((slug) => SLUG.test(slug)).slice(0, 5),
    postalCode: isPostalCode(postalCode) ? postalCode : "",
  };
}

function countActive(filters: DirectoryFilters): number {
  return [
    filters.serviceSlugs.length > 0,
    hasOrigin(filters),
    filters.maxPrice !== null,
    filters.minStars !== null,
    filters.emergency,
    filters.contactableOnly,
  ].filter(Boolean).length;
}

// Klinikoversigten (architecture 6.1, 6.6): filtre, sortering, liste og kort. Listen og kortet får præcis det samme svar
// fra GET /api/clinics. På desktop står de side om side, på mobil skifter man mellem dem.
export function ClinicDirectory() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<DirectoryFilters>(() => initialFilters(params));
  const [resetVersion, setResetVersion] = useState(0);
  const [view, setView] = useState<MobileView>("list");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<CompareChoice[]>([]);

  const caseParam = params.get("sag");
  const caseId = caseParam && UUID.test(caseParam) ? caseParam : null;

  const query = useMemo(() => buildClinicsQuery(filters), [filters]);
  const loader = useCallback(async (): Promise<Loaded> => ({ ...(await apiRequest<ClinicListDto>(`/api/clinics?${query}`)), query }), [query]);
  const clinics = useLoad(loader);
  const catalog = useLoad(loadServiceGroups);

  const patch = useCallback((change: Partial<DirectoryFilters>) => setFilters((current) => ({ ...current, ...change })), []);
  const reset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setResetVersion((v) => v + 1);
  }, []);

  const data = clinics.data;
  const updating = data !== null && data.query !== query;
  const hasServices = filters.serviceSlugs.length > 0;
  const activeCount = countActive(filters);
  const withoutLocation = data ? data.clinics.filter((clinic) => !clinic.location).length : 0;

  function toggleChoice(id: string, name: string) {
    setChosen((current) => {
      if (current.some((c) => c.id === id)) return current.filter((c) => c.id !== id);
      return current.length >= MAX_COMPARE ? current : [...current, { id, name }];
    });
  }

  return (
    <div className={cx("mx-auto flex w-full max-w-wide flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10", chosen.length > 0 && "pb-40 sm:pb-32")}>
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Find en klinik</h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Sammenlign klinikker uden at skrive til dem først. Priser vises ifølge klinikkens egen prisliste, og klinikken laver altid
          den endelige vurdering af dit behov.{" "}
          {CHAT_READY && (
            <>
              Vil du hellere beskrive dit problem?{" "}
              <Link href={CHAT_HREF} className="font-semibold text-brand-700">
                Start samtalen
              </Link>
              .
            </>
          )}
        </p>
        {filters.emergency && (
          <Alert tone="warning" title="Akut tandpine">
            Her ser du klinikker med en ledig akuttid inden for {EMERGENCY_FILTER_HOURS} timer, sorteret efter den tidligste. Er det
            livstruende, eller har du svært ved at trække vejret eller synke, så ring 112.
          </Alert>
        )}
      </header>

      <ClinicFilters
        key={resetVersion}
        filters={filters}
        onChange={patch}
        onReset={reset}
        groups={catalog.data}
        activeCount={activeCount}
      />

      <section aria-labelledby="resultater" className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id="resultater" className="text-xl font-semibold text-ink">
              Klinikker
              {data && (
                <span className="font-normal text-ink-muted" aria-live="polite">
                  {" "}
                  ({data.clinics.length}){updating && " · opdaterer …"}
                </span>
              )}
            </h2>
            {data && data.criteria.length > 0 && (
              <div className="text-sm text-ink-muted">
                <p className="font-semibold text-ink">Listen er valgt og sorteret sådan:</p>
                <ul className="list-disc pl-5" data-testid="kriterier">
                  {data.criteria.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="w-full sm:w-72">
            <SortSelect
              value={filters.sort ?? data?.sort ?? "first_available"}
              onChange={(sort) => patch({ sort })}
              hasOrigin={hasOrigin(filters)}
              hasServices={hasServices}
            />
          </div>
        </div>

        <div className="lg:hidden">
          <FilterChips
            label="Vis som"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "Liste" },
              { value: "map", label: "Kort" },
            ]}
          />
        </div>

        <LoadState loading={clinics.loading && !data} error={clinics.error} onRetry={clinics.reload} />

        {data && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <div className={cx("flex-col gap-4 lg:flex", view === "list" ? "flex" : "hidden")}>
              {data.clinics.length === 0 ? (
                <Alert tone="info" title="Ingen klinikker matcher dine valg">
                  <p>Prøv at udvide afstanden, fjerne et filter eller vælge færre behandlinger.</p>
                  {activeCount > 0 && (
                    <Button variant="secondary" className="mt-3" onClick={reset}>
                      Nulstil filtre
                    </Button>
                  )}
                </Alert>
              ) : (
                <ul className={cx("grid gap-4 sm:grid-cols-2", updating && "opacity-60")} aria-busy={updating}>
                  {data.clinics.map((clinic) => (
                    <ClinicCard
                      key={clinic.id}
                      clinic={clinic}
                      hasServices={hasServices}
                      emergency={filters.emergency}
                      highlighted={hoveredId === clinic.id}
                      onHover={setHoveredId}
                      compare={
                        caseId
                          ? {
                              selected: chosen.some((c) => c.id === clinic.id),
                              disabled: chosen.length >= MAX_COMPARE,
                              onToggle: () => toggleChoice(clinic.id, clinic.name),
                            }
                          : null
                      }
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className={cx("flex-col gap-2 lg:sticky lg:top-4 lg:flex", view === "map" ? "flex" : "hidden")}>
              <div
                role="region"
                aria-label="Kort over klinikkerne i listen"
                className="isolate h-[65dvh] min-h-80 overflow-hidden rounded-card border border-line shadow-card lg:h-[calc(100dvh-8rem)]"
              >
                <ClinicMapLazy
                  clinics={data.clinics}
                  hasServices={hasServices}
                  emergency={filters.emergency}
                  highlightedId={hoveredId}
                />
              </div>
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-brand-700">Blå markør med hak:</span> verificeret klinik.{" "}
                <span className="font-semibold text-ink">Lille hvid markør:</span> klinik, der endnu ikke er på TandMatch.
                {withoutLocation > 0 && ` ${withoutLocation} klinik${withoutLocation === 1 ? "" : "ker"} uden kortplacering vises kun i listen.`}
              </p>
            </div>
          </div>
        )}
      </section>

      {caseId && (
        <CompareBar caseId={caseId} choices={chosen} onRemove={(id) => setChosen((current) => current.filter((c) => c.id !== id))} />
      )}
    </div>
  );
}
