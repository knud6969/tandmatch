import type { Metadata } from "next";
import { PriceListForm } from "@/features/clinics/components/price-list-form";
import { ClinicSettingsNav } from "@/features/clinics/components/clinic-settings-nav";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Prisliste" };

export default function ClinicPage() {
  return (
    <Container>
      <ClinicSettingsNav />
      <PageIntro title="Prisliste">
        <p>Vælg kategorier, og angiv pris og varighed.</p>
      </PageIntro>
      <PriceListForm />
    </Container>
  );
}
