import type { Metadata } from "next";
import { PriceListForm } from "@/views/components/clinic/price-list-form";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Prisliste" };

export default function ClinicPage() {
  return (
    <Container>
      <PageIntro title="Prisliste">
        <p>Vælg først de behandlingskategorier, du tilbyder, og angiv derefter pris og varighed på behandlingerne.</p>
      </PageIntro>
      <PriceListForm />
    </Container>
  );
}
