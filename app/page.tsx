import type { Metadata } from "next";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Forside" };

export default function HomePage() {
  return (
    <Container size="wide" className="sm:gap-10">
      <PageIntro title="Den rigtige tandlæge til dit tandproblem">
        <p>
          TandMatch hjælper dig med at beskrive dit ønske og finde tandlæger, der kan svare dig. Du bestemmer selv,
          hvad du deler, og du godkender altid teksten, før en tandlæge ser den.
        </p>
      </PageIntro>

      <section aria-labelledby="spor-overskrift" className="flex flex-col gap-4">
        <h2 id="spor-overskrift" className="text-xl font-semibold text-ink">
          Vælg det, der passer til dig
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-ink">Kosmetisk behandling</h3>
            <p className="text-base leading-relaxed text-ink-muted">
              Til ønsker som mellemrum mellem tænderne, facader og blegning. Du beskriver dit ønske i en chat, og
              tandlæger svarer dig personligt med vurdering, prisinterval og første ledige tid.
            </p>
            <div className="mt-auto pt-2">
              <LinkButton href="/start" fullWidth className="sm:w-auto">
                Start samtale
              </LinkButton>
              <p className="mt-2 text-sm text-ink-muted">Ingen konto nødvendig for at starte.</p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-ink">Almindelig eller akut tandlæge</h3>
            </div>
            <p className="text-base leading-relaxed text-ink-muted">
              Se tandlæger i nærheden med næste ledige tid, prisinterval for standardydelser og anmeldelser.
            </p>
            <div className="mt-auto flex flex-col items-start gap-2 pt-2">
              <Badge>Kommer snart</Badge>
              <span
                aria-disabled="true"
                className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-lg bg-canvas px-5 text-base font-semibold text-ink-muted ring-1 ring-inset ring-line sm:w-auto"
              >
                Find tandlæger
              </span>
            </div>
          </Card>
        </div>
      </section>

      <AiDisclaimer />

      <section aria-labelledby="tandlaege-overskrift" className="flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-8">
        <h2 id="tandlaege-overskrift" className="text-xl font-semibold text-ink">
          Er du tandlæge?
        </h2>
        <p className="text-base leading-relaxed text-ink-muted">
          Opret en profil og få forespørgsler, der matcher din praksis. Din profil verificeres, før du modtager
          forespørgsler.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/opret/tandlaege" variant="secondary">
            Opret tandlægeprofil
          </LinkButton>
          <LinkButton href="/login" variant="ghost">
            Har du allerede en konto? Log ind
          </LinkButton>
        </div>
      </section>
    </Container>
  );
}
