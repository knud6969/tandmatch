import type { Metadata } from "next";
import { PriceListForm } from "@/views/components/clinic/price-list-form";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Prisliste" };

export default function ClinicPage() {
  return (
    <Container>
      <PageIntro title="Prisliste">
        <p>Vælg de ydelser, I tilbyder, og angiv prisinterval og varighed.</p>
      </PageIntro>
      <PriceListForm />
    </Container>
  );
}
