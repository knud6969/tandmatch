import type { Metadata } from "next";
import { DentistSignupForm } from "@/components/auth/dentist-signup-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret tandlægeprofil" };

export default function DentistSignupPage() {
  return (
    <Container>
      <PageIntro title="Opret tandlægeprofil">
        <p>
          Din profil er ikke verificeret, når du opretter den. Du kan logge ind med det samme, men du modtager først
          forespørgsler, når profilen er verificeret.
        </p>
      </PageIntro>
      <Card>
        <DentistSignupForm />
      </Card>
    </Container>
  );
}
