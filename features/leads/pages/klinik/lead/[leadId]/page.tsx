import type { Metadata } from "next";
import { InboxLayout } from "@/features/leads/components/inbox-layout";
import { LeadCard } from "@/features/leads/components/lead-card";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Henvendelse" };

export default async function ClinicLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return (
    <Container size="wide">
      <InboxLayout selectedId={leadId}>
        <LeadCard key={leadId} leadId={leadId} />
      </InboxLayout>
    </Container>
  );
}
