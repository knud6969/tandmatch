import type { Metadata } from "next";
import { ClinicForm } from "@/views/components/clinic/clinic-form";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Klinikprofil" };

export default function ClinicPage() {
  return (
    <Container>
      <PageIntro title="Klinikprofil">
        <p>Det her ser patienterne på jeres profil. Ændringer gemmes, når du trykker på Gem.</p>
      </PageIntro>
      <ClinicForm />
    </Container>
  );
}
