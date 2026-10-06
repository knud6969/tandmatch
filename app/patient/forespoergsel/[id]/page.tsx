import type { Metadata } from "next";
import { PatientResponses } from "@/components/patient/patient-responses";

export const metadata: Metadata = { title: "Svar på din forespørgsel" };

// Forespørgslen og alle svar på den (architecture 6.2). Data hentes via /api/requests/{id} og /api/requests/{id}/responses.
export default async function PatientRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientResponses requestId={id} />;
}
