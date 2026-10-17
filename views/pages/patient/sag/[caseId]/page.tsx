import type { Metadata } from "next";
import { CaseLeads } from "@/views/components/patient/case-leads";
import { Container } from "@/views/components/ui/container";

export const metadata: Metadata = { title: "Din sag" };

export default async function PatientCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return (
    <Container>
      <CaseLeads caseId={caseId} />
    </Container>
  );
}
