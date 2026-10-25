import type { Metadata } from "next";
import Link from "next/link";
import { FeatureCard } from "@/features/site/components/feature-card";
import { HomeActions } from "@/features/site/components/home-actions";
import { IconTile } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Patienter, der ved, hvad de vil have" };

const STEPS = [
  { icon: "clinic", title: "Opret klinikken", text: "Udfyld profil, prisliste og åbningstider én gang." },
  { icon: "inbox", title: "Få henvendelser", text: "Patienten har beskrevet sit behov i appen og set prisen fra jeres prisliste." },
  { icon: "calendar", title: "Svar på under et minut", text: "Accepter eller afvis. Patienten booker selv en tid i jeres kalender." },
] as const;

// Forsiden er til klinikker; patienter bruger appen (features/site 6.1).
export default function HomePage() {
  return (
    <>
      <section className="bg-brand-50">
        <div className="mx-auto flex max-w-wide flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
          <div className="flex max-w-3xl flex-col gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">Patienter, der ved, hvad de vil have</h1>
            <p className="text-lg leading-relaxed text-ink-muted">
              TandMatch sender jer henvendelser fra patienter, der har beskrevet deres behov og set jeres pris. Et svar
              tager under et minut.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <HomeActions />
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-wide flex-col gap-12 px-4 py-12 sm:gap-16 sm:px-6 sm:py-16">
        <section aria-labelledby="saadan" className="flex flex-col gap-6">
          <h2 id="saadan" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Sådan virker det
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <FeatureCard key={s.title} icon={s.icon} title={s.title} step={i + 1}>
                {s.text}
              </FeatureCard>
            ))}
          </ol>
          <Link href="/for-klinikker" className="self-start py-2 text-base font-semibold text-brand-700 underline underline-offset-4">
            Læs mere om TandMatch for klinikker
          </Link>
        </section>

        <section aria-labelledby="patient" className="flex items-start gap-4 rounded-card border border-line bg-surface p-5 sm:p-6">
          <IconTile name="tooth" />
          <div className="flex flex-col gap-1">
            <h2 id="patient" className="text-lg font-semibold text-ink">
              Er du patient? Hent appen
            </h2>
            <p className="text-base leading-relaxed text-ink-muted">
              Patienter finder og kontakter klinikker i TandMatch-appen. Den kommer snart til iPhone.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
