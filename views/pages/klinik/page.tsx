import type { Metadata } from "next";
import { ClinicHome } from "@/views/components/clinic/clinic-home";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Din klinik" };

export default function ClinicHomePage() {
  return (
    <Container>
      <PageIntro title="Din klinik">
        <p>Her svarer du på henvendelser fra patienter og ser, hvor langt opsætningen er.</p>
      </PageIntro>
      <ClinicHome />
    </Container>
  );
}
