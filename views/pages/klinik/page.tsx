import type { Metadata } from "next";
import { ClinicOverview } from "@/views/components/clinic/clinic-overview";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Din klinik" };

export default function ClinicHomePage() {
  return (
    <Container>
      <PageIntro title="Din klinik">
        <p>Her ser du, hvor langt opsætningen er. Indbakke med forespørgsler kommer her, når klinikken er verificeret.</p>
      </PageIntro>
      <ClinicOverview />
    </Container>
  );
}
