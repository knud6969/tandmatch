"use client";

import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/booking/constants/bookings";
import type { ClinicProfileDto } from "@/lib/clinics/types/clinics";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { ICONS } from "@/components/ui/icons";
import { LoadState } from "@/components/ui/load-state";
import { AvailabilitySlots } from "@/features/clinics/components/availability-slots";
import { ClinicMapLazy } from "@/features/clinics/components/clinic-map-loader";
import { ClinicWhere } from "@/features/clinics/components/clinic-facts";
import { DentistPortfolio } from "@/features/clinics/components/dentist-portfolio";
import { ExternalLink } from "@/features/clinics/components/external-link";
import { OpeningHours } from "@/features/clinics/components/opening-hours";
import { PriceList } from "@/features/clinics/components/price-list";
import { PublicReviewList } from "@/features/clinics/components/public-review-list";
import { StarRating } from "@/features/clinics/components/star-rating";
import { TierBadge } from "@/features/clinics/components/tier-badge";
import { TrustpilotBlock } from "@/features/clinics/components/trustpilot-block";
import { ApiRequestError, apiRequest } from "@/platform/ui-utils/api-client";
import { directoryHref } from "@/features/clinics/utils/clinic-query";
import { loadServiceGroups } from "@/features/clinics/utils/clinic-loaders";
import { formatShortDateTime } from "@/lib/common/domain/format";
import { phoneHref, safeWebsiteHref, websiteLabel } from "@/lib/common/domain/links";
import { BASIC_CLINIC_PROFILE_TITLE } from "@/lib/clinics/constants/clinic-texts";
import { useLoad } from "@/platform/ui-utils/use-load";

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

// Offentlig klinikprofil (architecture 6.1, 6.6). Henter profilen og viser den med ClinicProfileContent. Ukendte, oprettede
// og slettede klinikker giver 404.
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <Link href={backHref} className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
        ← Alle klinikker
      </Link>
      <ClinicProfileContent clinic={data.profile} mode="public" />
    </div>
  );
}

// Klinikprofilens indhold (features/clinics 6.5). Samme sektioner og rækkefølge som appens klinikprofil
// (mobile/src/screens/clinic-profile-screen.tsx): Om klinikken → Placering → Åbningstider → Prisliste → Anmeldelser →
// Trustpilot. Fuldt niveau (verificeret) viser alt; basisniveau viser grunddata, åbningstider og Trustpilot og siger tydeligt,
// at klinikken ikke er på TandMatch endnu.
//  * mode "public": webprofilen. Har også e-mail, ledige tider og tandlæger, som appen ikke viser.
//  * mode "preview": klinikkens forhåndsvisning af, hvad patienten ser i appen. `verified: false` (en `registered` klinik) viser
//    tekst i stedet for første ledige tid og anmeldelser, som ikke findes offentligt før verificering.
export function ClinicProfileContent({
  clinic,
  mode,
  verified = true,
}: {
  clinic: ClinicProfileDto;
  mode: "public" | "preview";
  verified?: boolean;
}) {
  const catalog = useLoad(loadServiceGroups);
  const full = clinic.tier === "full";
  const isPublic = mode === "public";
  const website = safeWebsiteHref(clinic.website);
  const stats = clinic.reviewStats;

  return (
    <div className="flex flex-col gap-6">
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
              {!verified ? (
                <span className="text-ink-muted">beregnes ud fra dine åbningstider og bookinger, når klinikken er verificeret</span>
              ) : clinic.firstAvailableAt ? (
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
            {isPublic && clinic.email && (
              <a href={`mailto:${clinic.email}`} className="inline-flex min-h-11 items-center font-semibold text-brand-700">
                {clinic.email}
              </a>
            )}
            {website && <ExternalLink href={website}>Klinikkens website: {websiteLabel(website)}</ExternalLink>}
          </div>
        </div>
      </header>

      {!full && (
        <Alert tone="info" title={BASIC_CLINIC_PROFILE_TITLE}>
          <p>
            Vi viser kun de grunddata, der er offentligt tilgængelige. Klinikken har endnu ikke oprettet sig hos os, så der er ingen
            prisliste, ingen verificerede anmeldelser og ingen ledige tider, og du kan ikke kontakte klinikken via TandMatch. Ring eller
            skriv til klinikken direkte.
          </p>
          {isPublic && (
            <p className="mt-2">
              Er det din klinik?{" "}
              <Link href="/opret/klinik" className="font-semibold text-brand-700 underline">
                Opret klinikken på TandMatch
              </Link>{" "}
              og bliv verificeret.
            </p>
          )}
        </Alert>
      )}

      {full && clinic.description && (
        <Section id="om-klinikken" title="Om klinikken">
          <p className="whitespace-pre-line text-base leading-relaxed text-ink">{clinic.description}</p>
        </Section>
      )}

      {clinic.location && (
        <Section id="placering" title="Placering">
          <div role="region" aria-label={`Kort over ${clinic.name}`} className="isolate h-72 overflow-hidden rounded-card border border-line">
            <ClinicMapLazy clinics={[clinic]} hasServices={false} emergency={false} popups={false} />
          </div>
          <ClinicWhere clinic={clinic} />
        </Section>
      )}

      <Section id="aabningstider" title="Åbningstider">
        <OpeningHours hours={clinic.openingHours} />
      </Section>

      {full && (
        <>
          <Section id="priser" title="Prisliste">
            <PriceList prices={clinic.allPrices} groups={catalog.data} />
          </Section>
          {isPublic && (
            <>
              <Section id="ledige-tider" title="Ledige tider">
                <AvailabilitySlots clinicId={clinic.id} prices={clinic.allPrices} />
              </Section>
              <Section id="tandlaeger" title="Tandlæger">
                <DentistPortfolio dentists={clinic.dentists} />
              </Section>
            </>
          )}
          <Section id="anmeldelser" title="Anmeldelser på TandMatch">
            {verified ? (
              <PublicReviewList clinicId={clinic.id} />
            ) : (
              <p className="text-base text-ink-muted">
                Her vises anmeldelser fra patienter, der har haft en tid hos klinikken via TandMatch. Anmeldelser og prisnøjagtighed
                bliver synlige, når klinikken er verificeret.
              </p>
            )}
          </Section>
        </>
      )}

      <Section id="trustpilot" title="Trustpilot (ekstern kilde)">
        <TrustpilotBlock trustpilot={clinic.trustpilot} />
      </Section>

      {isPublic && full && (
        <LinkButton href="/klinikker" variant="secondary" className="sm:w-fit">
          Sammenlign med andre klinikker
        </LinkButton>
      )}
    </div>
  );
}
