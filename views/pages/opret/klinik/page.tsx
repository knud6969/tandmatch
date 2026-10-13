import type { Metadata } from "next";
import { ClinicSignupForm } from "@/views/components/auth/clinic-signup-form";
import { Card } from "@/views/components/ui/card";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Opret klinik" };

export default function ClinicSignupPage() {
  return (
    <Container>
      <PageIntro title="Opret din klinik">
        <p>Det tager få minutter. Vi bruger CVR-nummeret til at forebygge dubletter. TandMatch tjekker klinikken, før den bliver verificeret.</p>
      </PageIntro>
      <Card>
        <ClinicSignupForm />
      </Card>
    </Container>
  );
}
