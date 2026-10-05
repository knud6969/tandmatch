import type { Metadata } from "next";
import { PatientSignupForm } from "@/components/auth/patient-signup-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret patientkonto" };

export default function PatientSignupPage() {
  return (
    <Container>
      <PageIntro title="Opret patientkonto">
        <p>Oplysningerne bruges til at oprette din konto. Vi viser aldrig dit navn eller din e-mail til tandlæger.</p>
      </PageIntro>
      <Card>
        <PatientSignupForm />
      </Card>
    </Container>
  );
}
