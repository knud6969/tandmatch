import type { Metadata } from "next";
import { Card } from "@/views/components/ui/card";
import { LinkButton } from "@/views/components/ui/button";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret konto" };

export default function OpretPage() {
  return (
    <Container>
      <PageIntro title="Opret konto">
        <p>Websiden er til klinikker. Patienter bruger TandMatch-appen.</p>
      </PageIntro>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">Jeg repræsenterer en klinik</h2>
          <p className="text-base leading-relaxed text-ink-muted">
            Sæt profil, prisliste og åbningstider op, og modtag henvendelser fra patienter, når klinikken er verificeret.
          </p>
          <LinkButton href="/opret/klinik" variant="secondary" fullWidth className="mt-auto">
            Opret klinik
          </LinkButton>
        </Card>
      </div>
    </Container>
  );
}
