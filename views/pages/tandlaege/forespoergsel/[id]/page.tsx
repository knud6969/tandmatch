import type { Metadata } from "next";
import { RequestDetail } from "@/views/components/dentist/request-detail";

export const metadata: Metadata = { title: "Forespørgsel" };

// Forespørgsel for tandlægen med eget svar (architecture 6.3). Data hentes via API'et.
export default async function DentistRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetail requestId={id} />;
}
