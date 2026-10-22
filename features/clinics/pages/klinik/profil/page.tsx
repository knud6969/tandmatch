import type { Metadata } from "next";
import { ClinicForm } from "@/features/clinics/components/clinic-form";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Klinikprofil" };

export default function ClinicPage() {
  return (
    <Container>
      <PageIntro title="Klinikprofil">
        <p>Det her ser patienterne på klinikkens profil. Ændringer gemmes, når du trykker på Gem.</p>
      </PageIntro>
      <ClinicForm />
    </Container>
  );
}
