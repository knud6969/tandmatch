import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/common/constants/limits";
import type { Metadata } from "next";
import { DIRECTORY_HREF, DIRECTORY_READY } from "@/lib/common/navigation/entries";
import { ClinicPreview } from "@/features/site/components/clinic-preview";
import { EntryButton } from "@/features/site/components/entry-button";
import { FeatureCard } from "@/features/site/components/feature-card";
import { HomeFlash } from "@/features/identity/components/home-flash";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { LinkButton } from "@/components/ui/button";
import { ICONS } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Find den rigtige klinik til en fair pris" };

const STEPS = [
  { icon: "chat", title: "Beskriv problemet", text: "Skriv med dine egne ord eller upload et billede. AI hjælper dig med at sætte ord på det." },
  { icon: "tag", title: "Sammenlign klinikker", text: "Se priser fra klinikkens prisliste, anmeldelser og første ledige tid side om side." },
  { icon: "inbox", title: `Kontakt op til ${MAX_ACTIVE_LEADS_PER_CASE} klinikker`, text: "Send din beskrivelse til de klinikker, du vil høre fra. De svarer med deres egen vurdering." },
  { icon: "calendar", title: "Book din tid", text: "Vælg en ledig tid, og få bekræftelse. Bagefter kan du anmelde besøget." },
] as const;

export default function HomePage() {
  return (
    <>
      <HomeFlash />
      <section className="bg-brand-50">
        <div className="mx-auto flex max-w-wide flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
          <div className="flex max-w-3xl flex-col gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">
              Find den rigtige tandlæge til en fair pris
            </h1>
            <p className="text-lg leading-relaxed text-ink-muted">
              Se priser, anmeldelser og ledige tider på ét sted, og book direkte. Du bestemmer selv, hvilke klinikker
              du vil høre fra.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <EntryButton href={DIRECTORY_HREF} ready={DIRECTORY_READY}>
              Find en klinik
            </EntryButton>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-wide flex-col gap-14 px-4 py-12 sm:gap-20 sm:px-6 sm:py-16">
        <section aria-labelledby="saadan" className="flex flex-col gap-6">
          <h2 id="saadan" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Sådan virker det
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <FeatureCard key={s.title} icon={s.icon} title={s.title} step={i + 1}>
                {s.text}
              </FeatureCard>
            ))}
          </ol>
          <div>
            <LinkButton href="/saadan-virker-det" variant="secondary">
              Læs mere
            </LinkButton>
          </div>
        </section>

        <section aria-labelledby="klinikker" className="flex flex-col gap-6">
          <h2 id="klinikker" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Klinikker med overblik
          </h2>
          <p className="max-w-prose text-base leading-relaxed text-ink-muted">
            Sådan kan et klinikkort se ud. Eksemplerne er illustrationer og ikke rigtige klinikker.
          </p>
          <ul className="grid gap-4 sm:grid-cols-3">
            <ClinicPreview name="Eksempelklinik A" area="København" tone="a" />
            <ClinicPreview name="Eksempelklinik B" area="Aarhus" tone="b" />
            <ClinicPreview name="Eksempelklinik C" area="Odense" tone="c" />
          </ul>
        </section>

        <section aria-labelledby="patienter" className="flex flex-col gap-6">
          <h2 id="patienter" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Til dig som patient
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            <FeatureCard icon="tag" title="Gennemsigtige priser">
              Priser vises altid med kilde, fx “ifølge klinikkens prisliste”.
            </FeatureCard>
            <FeatureCard icon="shield" title="Verificerede anmeldelser">
              Egne anmeldelser kommer kun fra patienter med en gennemført booking. Trustpilot vises adskilt.
            </FeatureCard>
            <FeatureCard icon="calendar" title="Ledige tider">
              Se første ledige tid og book uden at ringe rundt.
            </FeatureCard>
          </ul>
        </section>

        <section aria-labelledby="til-klinikker" className="flex flex-col gap-6 rounded-card bg-brand-700 p-6 text-on-brand sm:p-10">
          <h2 id="til-klinikker" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Er du klinik?
          </h2>
          <ul className="grid gap-3 text-base leading-relaxed sm:grid-cols-3">
            <li className="flex gap-3"><span className="shrink-0">{ICONS.inbox}</span>Få henvendelser fra patienter, der har beskrevet deres behov.</li>
            <li className="flex gap-3"><span className="shrink-0">{ICONS.map}</span>Vis din profil, prisliste og ledige tider.</li>
            <li className="flex gap-3"><span className="shrink-0">{ICONS.star}</span>Opbyg verificerede anmeldelser.</li>
          </ul>
          <div>
            <LinkButton href="/for-klinikker" variant="secondary">
              Se hvordan det virker for klinikker
            </LinkButton>
          </div>
        </section>

        <AiDisclaimer />
      </div>
    </>
  );
}
