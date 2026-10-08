import type { Metadata } from "next";
import { AnonymousPatientBanner } from "@/views/components/session/area-banners";
import { StartForm } from "@/views/components/start/start-form";
import { Card } from "@/views/components/ui/card";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Start en samtale" };

export default function StartPage() {
  return (
    <Container>
      <AnonymousPatientBanner />
      <PageIntro title="Start en samtale">
        <p>
          Vælg hvad din henvendelse handler om, og giv samtykke til, at din tekst behandles af AI-assistenten. Du
          behøver ikke en konto for at starte. Billeder kan du tilføje senere i samtalen, hvis du vil.
        </p>
      </PageIntro>
      <Card>
        <StartForm />
      </Card>
    </Container>
  );
}
