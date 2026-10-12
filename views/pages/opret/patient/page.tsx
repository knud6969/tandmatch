import type { Metadata } from "next";
import { PatientSignupForm } from "@/views/components/auth/patient-signup-form";
import { Card } from "@/views/components/ui/card";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret patientkonto" };

export default function PatientSignupPage() {
  return (
    <Container>
      <PageIntro title="Opret patientkonto">
        <p>Oplysningerne bruges til at oprette din konto. Klinikker ser først dit navn og dine kontaktoplysninger, når du har booket en tid hos dem.</p>
      </PageIntro>
      <Card>
        <PatientSignupForm />
      </Card>
    </Container>
  );
}
