import type { Metadata } from "next";
import { CaseList } from "@/views/components/patient/case-list";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Mine sager" };

export default function PatientHomePage() {
  return (
    <Container>
      <PageIntro title="Mine sager">
        <p>Her ser du de sager, du har oprettet, og hvilke klinikker de er sendt til.</p>
      </PageIntro>
      <CaseList />
    </Container>
  );
}
