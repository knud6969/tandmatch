"use client";

import { useEffect, useState } from "react";
import { PublicReviewList } from "@/components/standard/public-review-list";
import { TrustpilotBlock } from "@/components/standard/trustpilot-block";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DefinitionList } from "@/components/ui/definition-list";
import { PageIntro } from "@/components/ui/page-intro";
import { Alert } from "@/components/ui/alert";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { serviceLabel } from "@/lib/constants/standard-labels";
import { formatDateTime, formatOneDecimal, formatPercent, formatPriceRange } from "@/lib/format/danish";
import type { DentistProfileDto, PublicReviewDto, ReviewStats } from "@/lib/types/standard";

type Loaded = { profile: DentistProfileDto; stats: ReviewStats; reviews: PublicReviewDto[] };

type State =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "notFound" }
  | { status: "error"; message: string };

async function load(dentistId: string): Promise<State> {
  const path = encodeURIComponent(dentistId);
  try {
    const [profile, reviews] = await Promise.all([
      apiRequest<DentistProfileDto>(`/api/dentists/${path}`),
      apiRequest<{ stats: ReviewStats; reviews: PublicReviewDto[] }>(`/api/dentists/${path}/reviews`),
    ]);
    return { status: "ready", data: { profile, stats: reviews.stats, reviews: reviews.reviews } };
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === "NOT_FOUND") return { status: "notFound" };
    return { status: "error", message: apiErrorMessage(err) };
  }
}

// Offentlig tandlægeprofil (architecture 6.1, 10.8, 10.9). Trustpilot og platformens anmeldelser vises i hver sin sektion.
export function DentistProfileView({ dentistId }: { dentistId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    load(dentistId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [dentistId]);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser tandlægen …
      </p>
    );
  }

  if (state.status === "notFound") {
    return (
      <Alert tone="warning" title="Tandlægen blev ikke fundet">
        <p>Profilen findes ikke, eller den er ikke længere offentlig.</p>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Profilen kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  const { profile, stats, reviews } = state.data;
  const name = profile.title ? `${profile.title} ${profile.fullName}` : profile.fullName;
  const clinic = profile.clinic;
  const contact = [clinic.address, `${clinic.postalCode} ${clinic.city}`].join(", ");

  return (
    <>
      <LinkButton href="/tandlaeger" variant="ghost" className="self-start px-0">
        ← Find tandlæge
      </LinkButton>

      <PageIntro title={name}>
        <p>
          {clinic.name}, {contact}
        </p>
        {clinic.phone && <p>Telefon: {clinic.phone}</p>}
      </PageIntro>

      <Card className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold text-ink">Priser for standardydelser</h2>
        <p className="text-sm text-ink-muted">Vejledende prisinterval angivet af klinikken. Den endelige pris fastsættes af tandlægen efter undersøgelse.</p>
        {profile.prices.length === 0 ? (
          <p className="text-base text-ink-muted">Klinikken har ikke angivet priser endnu.</p>
        ) : (
          <DefinitionList
            items={profile.prices.map((p) => ({
              label: serviceLabel(p.service),
              value: `${formatPriceRange(p.price.min, p.price.max)}${p.note ? `\n${p.note}` : ""}`,
            }))}
          />
        )}
        <div className="flex flex-col gap-1 border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink-muted">Næste ledige tid</p>
          <p className="text-base text-ink">
            {profile.nextAvailableAt
              ? formatDateTime(profile.nextAvailableAt)
              : "Ikke oplyst for nylig. Kontakt klinikken for at høre om ledige tider."}
          </p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ink">Trustpilot</h2>
        <p className="text-sm text-ink-muted">Dette er klinikkens egen oplysning fra Trustpilot. TandMatch henter ikke data derfra.</p>
        <TrustpilotBlock trustpilot={profile.trustpilot} />
      </Card>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">TandMatch-anmeldelser</h2>
          <p className="text-sm text-ink-muted">Kun verificerede besøg, der er gennemgået af moderation.</p>
        </div>
        <DefinitionList
          items={[
            {
              label: "Antal anmeldelser",
              value: String(stats.reviewCount),
            },
            {
              label: "Gennemsnit",
              value: stats.avgStars !== null ? `${formatOneDecimal(stats.avgStars)} af 5` : "Ingen endnu",
            },
            {
              label: "Prisnøjagtighed",
              value:
                stats.priceAccuracyPct !== null
                  ? `${formatPercent(stats.priceAccuracyPct)} af anmelderne svarede, at den endelige pris var som oplyst`
                  : "Vises, når der er mindst tre godkendte anmeldelser.",
            },
          ]}
        />
        <div className="border-t border-line pt-5">
          <PublicReviewList reviews={reviews} />
        </div>
      </Card>
    </>
  );
}
