import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret konto" };

export default function OpretPage() {
  return (
    <Container>
      <PageIntro title="Opret konto">
        <p>Vælg den type konto, du vil oprette.</p>
      </PageIntro>
      <div className="grid gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">Jeg er patient</h2>
          <p className="text-base leading-relaxed text-ink-muted">
            Du kan sende forespørgsler til tandlæger og følge deres svar.
          </p>
          <LinkButton href="/opret/patient" variant="secondary" fullWidth className="sm:w-auto sm:self-start">
            Opret patientkonto
          </LinkButton>
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">Jeg er tandlæge</h2>
          <p className="text-base leading-relaxed text-ink-muted">
            Du opretter en profil. Din autorisation kontrolleres, før du modtager forespørgsler.
          </p>
          <LinkButton href="/opret/tandlaege" variant="secondary" fullWidth className="sm:w-auto sm:self-start">
            Opret tandlægeprofil
          </LinkButton>
        </Card>
      </div>
    </Container>
  );
}
