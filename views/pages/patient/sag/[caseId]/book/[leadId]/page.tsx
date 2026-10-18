import type { Metadata } from "next";
import { BookingPicker } from "@/views/components/patient/booking-picker";
import { Container } from "@/views/components/ui/container";

export const metadata: Metadata = { title: "Book tid" };

export default async function PatientBookPage({ params }: { params: Promise<{ caseId: string; leadId: string }> }) {
  const { caseId, leadId } = await params;
  return (
    <Container>
      <BookingPicker caseId={caseId} leadId={leadId} />
    </Container>
  );
}
