import { redirect } from "next/navigation";

// Den gamle svar-adresse sender videre til forespørgslen, hvor svarene nu vises.
export default async function PatientResponsesLegacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/patient/forespoergsel/${encodeURIComponent(id)}`);
}
