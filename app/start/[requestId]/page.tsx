import type { Metadata } from "next";
import { guardWizard } from "@/app/_lib/guard-wizard";
import { RequestWizard } from "@/components/wizard/request-wizard";

export const metadata: Metadata = { title: "Din forespørgsel" };

// Wizarden for både anonyme patienter og patienter med konto (architecture 6.1).
export default async function RequestWizardPage({ params }: { params: Promise<{ requestId: string }> }) {
  await guardWizard();
  const { requestId } = await params;
  return <RequestWizard requestId={requestId} />;
}
