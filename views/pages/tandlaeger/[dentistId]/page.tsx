import type { Metadata } from "next";
import { DentistProfileView } from "@/views/components/standard/dentist-profile-view";
import { Container } from "@/views/components/ui/container";

export const metadata: Metadata = { title: "Tandlæge" };

// Offentlig tandlægeprofil (architecture 6.1, 10.8).
export default async function DentistPublicPage({ params }: { params: Promise<{ dentistId: string }> }) {
  const { dentistId } = await params;
  return (
    <Container size="wide">
      <DentistProfileView dentistId={dentistId} />
    </Container>
  );
}
