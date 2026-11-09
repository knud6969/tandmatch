import type { Metadata } from "next";
import { ClinicHome } from "@/features/leads/components/clinic-home";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Henvendelser" };

export default function ClinicHomePage() {
  return (
    <Container size="wide">
      <PageIntro title="Henvendelser" />
      <ClinicHome />
    </Container>
  );
}
