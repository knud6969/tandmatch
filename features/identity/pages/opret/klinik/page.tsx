import type { Metadata } from "next";
import { ClinicSignupForm } from "@/features/identity/components/clinic-signup-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret klinik" };

export default function ClinicSignupPage() {
  return (
    <Container>
      <PageIntro title="Opret din klinik">
        <p>Det tager få minutter, og du kan sætte profil og prisliste op med det samme. CVR-nummeret knytter kontoen til klinikken og bruges, når vi verificerer den.</p>
      </PageIntro>
      <Card>
        <ClinicSignupForm />
      </Card>
    </Container>
  );
}
