import type { Metadata } from "next";
import { LeadCard } from "@/views/components/clinic/lead-card";
import { Container } from "@/views/components/ui/container";

export const metadata: Metadata = { title: "Henvendelse" };

export default async function ClinicLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return (
    <Container size="wide">
      <LeadCard leadId={leadId} />
    </Container>
  );
}
