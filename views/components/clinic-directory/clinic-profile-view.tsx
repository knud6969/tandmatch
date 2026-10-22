"use client";

import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/constants/bookings";
import type { ClinicProfileDto } from "@/lib/types/clinics";
import { Alert } from "@/views/components/ui/alert";
import { LinkButton } from "@/views/components/ui/button";
import { ICONS } from "@/views/components/ui/icons";
import { LoadState } from "@/views/components/ui/load-state";
import { AvailabilitySlots } from "@/views/components/clinic-directory/availability-slots";
import { ClinicMapLazy } from "@/views/components/clinic-directory/clinic-map-loader";
import { ClinicWhere } from "@/views/components/clinic-directory/clinic-facts";
import { DentistPortfolio } from "@/views/components/clinic-directory/dentist-portfolio";
import { ExternalLink } from "@/views/components/clinic-directory/external-link";
import { OpeningHours } from "@/views/components/clinic-directory/opening-hours";
import { PriceList } from "@/views/components/clinic-directory/price-list";
import { PublicReviewList } from "@/views/components/clinic-directory/public-review-list";
import { StarRating } from "@/views/components/clinic-directory/star-rating";
import { TierBadge } from "@/views/components/clinic-directory/tier-badge";
import { TrustpilotBlock } from "@/views/components/clinic-directory/trustpilot-block";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { directoryHref } from "@/views/utils/clinic-query";
import { loadServiceGroups } from "@/views/utils/clinic-loaders";
import { formatShortDateTime } from "@/views/utils/format";
import { phoneHref, safeWebsiteHref, websiteLabel } from "@/views/utils/links";
import { useLoad } from "@/views/utils/use-load";

type Result = { kind: "found"; profile: ClinicProfileDto } | { kind: "missing" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 id={id} className="text-xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Offentlig klinikprofil (architecture 6.1, 6.6). Fuldt niveau (verificeret) viser alt; basisniveau viser grunddata,
// åbningstider og Trustpilot og siger tydeligt, at klinikken ikke er på TandMatch endnu. Ukendte, oprettede og slettede
// klinikker giver 404.
export function ClinicProfileView({ clinicId }: { clinicId: string }) {
  const loader = useCallback(async (): Promise<Result> => {
    try {
      return { kind: "found", profile: await apiRequest<ClinicProfileDto>(`/api/clinics/${clinicId}`) };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return { kind: "missing" };
      throw error;
    }
  }, [clinicId]);
  const { data, loading, error, reload } = useLoad(loader);
  const catalog = useLoad(loadServiceGroups);
  const searchParams = useSearchParams();
  // Oversigtens filtre ligger i profilens adresse og bevares på tilbagelinket.
  const backHref = directoryHref(searchParams.toString());

  if (data?.kind === "missing") notFound();

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-wide px-4 py-8 sm:px-6">
        <LoadState loading={loading} error={error} onRetry={reload} />
      </div>
    );
  }

  const clinic = data.profile;
  const full = clinic.tier === "full";
  const website = safeWebsiteHref(clinic.website);
  const stats = clinic.reviewStats;

  return (
    <div className="mx-auto flex w-full max-w-wide flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <Link href={backHref} className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
        ← Alle klinikker
      </Link>

      <header className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:p-8">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-card bg-brand-50 text-brand-700 sm:size-36">
          {full && clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen.
            <img src={clinic.logoUrl} alt={`Logo for ${clinic.name}`} className="size-full object-contain p-3" />
          ) : (
            <span className="[&_svg]:size-14">{ICONS.clinic}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div>
            <TierBadge tier={clinic.tier} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{clinic.name}</h1>
          <ClinicWhere clinic={clinic} size="base" />
          {full && stats && stats.reviewCount > 0 && stats.avgStars !== null && (
            <p className="text-base text-ink-muted">
              <StarRating value={stats.avgStars} count={stats.reviewCount} size="lg" /> verificerede anmeldelser
            </p>
          )}
          {full && (
            <p className="text-base text-ink">
              <span className="text-ink-muted">Første ledige tid (undersøgelse): </span>
              {clinic.firstAvailableAt ? (
                <span className="font-semibold">{formatShortDateTime(clinic.firstAvailableAt)}</span>
              ) : (
                <span className="text-ink-muted">{`ingen ledige tider de næste ${FIRST_AVAILABLE_SEARCH_DAYS} dage`}</span>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {clinic.phone && (
              <a href={phoneHref(clinic.phone)} className="inline-flex min-h-11 items-center font-semibold text-brand-700">
                Ring: {clinic.phone}
              </a>
            )}
            {clinic.email && (
              <a href={`mailto:${clinic.email}`} className="inline-flex min-h-11 items-center font-semibold text-brand-700">
                {clinic.email}
              </a>
            )}
            {website && <ExternalLink href={website}>Klinikkens website: {websiteLabel(website)}</ExternalLink>}
          </div>
        </div>
      </header>

      {!full && (
        <Alert tone="info" title="Klinikken er endnu ikke på TandMatch">
          <p>
            Vi viser kun de grunddata, der er offentligt tilgængelige. Klinikken har endnu ikke oprettet sig hos os, så der er ingen
            prisliste, ingen verificerede anmeldelser og ingen ledige tider, og du kan ikke kontakte klinikken via TandMatch. Ring eller
            skriv til klinikken direkte.
          </p>
          <p className="mt-2">
            Er det din klinik?{" "}
            <Link href="/opret/klinik" className="font-semibold text-brand-700 underline">
              Opret klinikken på TandMatch
            </Link>{" "}
            og bliv verificeret.
          </p>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {full && clinic.description && (
            <Section id="om-klinikken" title="Om klinikken">
              <p className="whitespace-pre-line text-base leading-relaxed text-ink">{clinic.description}</p>
            </Section>
          )}

          {full && (
            <>
              <Section id="priser" title="Prisliste">
                <PriceList prices={clinic.allPrices} groups={catalog.data} />
              </Section>
              <Section id="ledige-tider" title="Ledige tider">
                <AvailabilitySlots clinicId={clinic.id} prices={clinic.allPrices} />
              </Section>
              <Section id="tandlaeger" title="Tandlæger">
                <DentistPortfolio dentists={clinic.dentists} />
              </Section>
              <Section id="anmeldelser" title="Anmeldelser på TandMatch">
                <PublicReviewList clinicId={clinic.id} />
              </Section>
            </>
          )}

          <Section id="trustpilot" title="Trustpilot (ekstern kilde)">
            <TrustpilotBlock trustpilot={clinic.trustpilot} />
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6" aria-label="Praktisk information">
          <Section id="aabningstider" title="Åbningstider">
            <OpeningHours hours={clinic.openingHours} />
          </Section>
          {clinic.location && (
            <Section id="kort" title="Kort">
              <div role="region" aria-label={`Kort over ${clinic.name}`} className="isolate h-72 overflow-hidden rounded-card border border-line">
                <ClinicMapLazy clinics={[clinic]} hasServices={false} emergency={false} popups={false} />
              </div>
              <ClinicWhere clinic={clinic} />
            </Section>
          )}
          {full && (
            <LinkButton href="/klinikker" variant="secondary">
              Sammenlign med andre klinikker
            </LinkButton>
          )}
        </aside>
      </div>
    </div>
  );
}
