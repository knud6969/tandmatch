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
        <p>Opret en patientkonto. Klinikker kan oprette sig senere.</p>
      </PageIntro>
      <div className="grid gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">Jeg er patient</h2>
          <p className="text-base leading-relaxed text-ink-muted">
            Du kan beskrive dit tandproblem og sende din sag til klinikker.
          </p>
          <LinkButton href="/opret/patient" variant="secondary" fullWidth className="sm:w-auto sm:self-start">
            Opret patientkonto
          </LinkButton>
        </Card>
      </div>
    </Container>
  );
}
