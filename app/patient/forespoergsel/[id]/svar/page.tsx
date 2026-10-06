import type { Metadata } from "next";
import { PatientResponses } from "@/components/patient/patient-responses";

export const metadata: Metadata = { title: "Svar på din forespørgsel" };

// Svar på patientens egen forespørgsel (architecture 6.2, 10.6). Data hentes via /api/requests/{id}/responses.
export default async function PatientResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientResponses requestId={id} />;
}
