"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMERGENCY_FILTER_HOURS } from "@/lib/constants/clinics";
import type { ClinicListDto } from "@/lib/types/clinics";
import { CHAT_HREF } from "@/lib/navigation/entries";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { cx } from "@/views/components/ui/cx";
import { FilterChips } from "@/views/components/ui/filter-chips";
import { LoadState } from "@/views/components/ui/load-state";
import { ClinicCard } from "@/views/components/clinic-directory/clinic-card";
import { ClinicFilters } from "@/views/components/clinic-directory/clinic-filters";
import { ClinicMapLazy } from "@/views/components/clinic-directory/clinic-map-loader";
import { CompareBar } from "@/views/components/clinic-directory/compare-bar";
import { SortSelect } from "@/views/components/clinic-directory/sort-select";
import { apiRequest } from "@/views/utils/api-client";
import { UUID } from "@/views/utils/case-links";
import { readSelection, writeSelection, type CompareChoice } from "@/views/utils/compare-selection";
import { useCaseSelection } from "@/views/utils/use-case-selection";
import { loadServiceGroups } from "@/views/utils/clinic-loaders";
import {
  buildClinicsQuery,
  DEFAULT_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  hasOrigin,
  type DirectoryFilters,
} from "@/views/utils/clinic-query";
import { useLoad } from "@/views/utils/use-load";

type Loaded = ClinicListDto & { query: string };
type MobileView = "list" | "map";

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

// Fortæller, hvad patienten kan vælge, når oversigten åbnes fra en sag (?sag=).
function CaseSelectionNotice({ caseId, state }: { caseId: string; state: ReturnType<typeof useCaseSelection> }) {
  if (state.loading) return <p role="status" className="text-base text-ink-muted">Henter din sag …</p>;
  const sag = state.data;
  if (state.error || !sag) {
    return (
      <Alert tone="warning" title="Vi kunne ikke finde din sag">
        <p>{state.error ?? "Sagen findes ikke."} Du kan stadig se klinikkerne, men ikke vælge dem til kontakt.</p>
        <Link href={CHAT_HREF} className="mt-2 inline-block font-semibold text-brand-700">
          Beskriv dit problem forfra
        </Link>
      </Alert>
    );
  }
  if (sag.slots === 0) {
    return (
      <Alert tone="info" title="Du kan ikke kontakte flere klinikker lige nu">
        <p>
          Din sag har allerede {sag.activeCount} aktive henvendelser. Trækker du en tilbage, bliver der plads til en ny klinik.
        </p>
        <Link href={`/patient/sag/${caseId}`} className="mt-2 inline-block font-semibold text-brand-700">
          Gå til din sag
        </Link>
      </Alert>
    );
  }
  if (!sag.caseDto.canSend) {
    return (
      <Alert tone="warning" title="Din sag er ikke klar til at blive sendt">
        <p>Godkend opsummeringen, og angiv behandlinger, tidsrum og postnummer, før du kan vælge klinikker.</p>
        <Link href={`/start/${caseId}`} className="mt-2 inline-block font-semibold text-brand-700">
          Tilbage til din sag
        </Link>
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Vælg klinikker til din sag">
      <p>
        Du kan vælge op til {sag.slots} klinik{sag.slots === 1 ? "" : "ker"} og kontakte dem samlet. Kun verificerede klinikker kan
        vælges. Klinikken ser først dit navn og dine kontaktoplysninger, når den har accepteret, og en tid er booket. Klinikken laver
        den endelige vurdering.
      </p>
    </Alert>
  );
}

// Klinikoversigten (architecture 6.1, 6.6): filtre, sortering, liste og kort. Listen og kortet får præcis det samme svar
// fra GET /api/clinics. På desktop står de side om side, på mobil skifter man mellem dem.
export function ClinicDirectory() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<DirectoryFilters>(() => filtersFromSearch(params));
  const [resetVersion, setResetVersion] = useState(0);
  const [view, setView] = useState<MobileView>("list");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const caseParam = params.get("sag");
  const caseId = caseParam && UUID.test(caseParam) ? caseParam : null;
  const [picked, setPicked] = useState<CompareChoice[]>(() => (caseId ? readSelection(caseId) : []));
  const sagContext = useCaseSelection(caseId);
  const sag = sagContext.data;
  const prefilled = useRef(false);

  // Valget kan kun være klinikker, sagen ikke allerede er sendt til, og højst så mange, som der er plads til.
  const chosen = useMemo(
    () => (sag ? picked.filter((c) => !sag.contactedIds.includes(c.id)).slice(0, sag.slots) : []),
    [picked, sag],
  );
  const canChoose = sag !== null && sag.caseDto.canSend && sag.slots > 0;

  // Filtrene spejles i adressen (B16), så genindlæsning, profil og tilbage samt deling bevarer dem.
  const currentSearch = params.toString();
  useEffect(() => {
    const next = filtersToSearch(filters, caseId);
    if (next !== currentSearch)
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
  }, [filters, caseId, currentSearch, pathname, router]);

  // Med en sag forvælges dens behandlinger og postnummer, hvis adressen ikke allerede har filtre (kun første gang).
  useEffect(() => {
    if (!sag || prefilled.current) return;
    prefilled.current = true;
    const { services, postalCode } = sag.caseDto;
    setFilters((current) =>
      current.serviceSlugs.length > 0 || hasOrigin(current)
        ? current
        : { ...current, serviceSlugs: services.map((s) => s.slug), postalCode: postalCode ?? "" },
    );
  }, [sag]);

  const query = useMemo(() => buildClinicsQuery(filters), [filters]);
  const loader = useCallback(
    async (): Promise<Loaded> => ({
      ...(await apiRequest<ClinicListDto>(`/api/clinics?${query}`)),
      query,
    }),
    [query],
  );
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

  function updatePicked(next: CompareChoice[]) {
    setPicked(next);
    if (caseId) writeSelection(caseId, next);
  }

  function toggleChoice(id: string, name: string) {
    if (chosen.some((c) => c.id === id)) return updatePicked(chosen.filter((c) => c.id !== id));
    if (chosen.length >= (sag?.slots ?? 0)) return;
    updatePicked([...chosen, { id, name }]);
  }

  return (
    <div className={cx("mx-auto flex w-full max-w-wide flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10", chosen.length > 0 && "pb-40 sm:pb-32")}>
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Find en klinik</h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Sammenlign klinikker uden at skrive til dem først. Priser vises ifølge klinikkens egen prisliste, og klinikken laver altid den
          endelige vurdering af dit behov. Vil du hellere beskrive dit problem?{" "}
          <Link href={CHAT_HREF} className="font-semibold text-brand-700">
            Start samtalen
          </Link>
          .
        </p>
        {caseId && <CaseSelectionNotice caseId={caseId} state={sagContext} />}
        {filters.emergency && (
          <Alert tone="warning" title="Akut tandpine">
            Her ser du klinikker med en ledig akuttid inden for {EMERGENCY_FILTER_HOURS} timer, sorteret efter den tidligste. Er det
            livstruende, eller har du svært ved at trække vejret eller synke, så ring 112. Uden for klinikkernes åbningstid kan du kontakte
            tandlægevagten via 1813.
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
                  {filters.emergency && (
                    <p className="mt-2" data-testid="akut-henvisning">
                      Har du akut tandpine lige nu, så kontakt tandlægevagten via 1813 (uden for åbningstid) eller ring til din egen
                      tandlæge. Ring 112, hvis det er livstruende.
                    </p>
                  )}
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
                      profileHref={caseId ? `/klinikker/${clinic.id}?sag=${caseId}` : undefined}
                      compare={
                        caseId && canChoose
                          ? {
                              selected: chosen.some((c) => c.id === clinic.id),
                              disabled: chosen.length >= sag.slots,
                              contacted: sag.contactedIds.includes(clinic.id),
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
                className="isolate h-[65dvh] min-h-80 overflow-hidden rounded-card border border-line shadow-card lg:h-[min(calc(100dvh-10rem),44rem)]"
              >
                <ClinicMapLazy clinics={data.clinics} hasServices={hasServices} emergency={filters.emergency} highlightedId={hoveredId} />
              </div>
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-brand-700">Blå markør med hak:</span> verificeret klinik.{" "}
                <span className="font-semibold text-ink">Lille hvid markør:</span> klinik, der endnu ikke er på TandMatch.
                {withoutLocation > 0 &&
                  ` ${withoutLocation} klinik${withoutLocation === 1 ? "" : "ker"} uden kortplacering vises kun i listen.`}
              </p>
            </div>
          </div>
        )}
      </section>

      {caseId && canChoose && (
        <CompareBar caseId={caseId} choices={chosen} max={sag.slots} onRemove={(id) => updatePicked(chosen.filter((c) => c.id !== id))} />
      )}
    </div>
  );
}
