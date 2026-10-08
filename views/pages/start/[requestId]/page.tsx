import type { Metadata } from "next";
import { RequestWizard } from "@/views/components/wizard/request-wizard";

export const metadata: Metadata = { title: "Din forespørgsel" };

// Wizarden for både anonyme patienter og patienter med konto (architecture 6.1). Vagten ligger i app/start/[requestId]/layout.tsx.
export default async function RequestWizardPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <RequestWizard requestId={requestId} />;
}
