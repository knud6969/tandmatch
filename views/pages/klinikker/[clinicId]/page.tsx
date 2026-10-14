import type { Metadata } from "next";
import { ClinicProfileView } from "@/views/components/clinic-directory/clinic-profile-view";

export const metadata: Metadata = { title: "Klinik" };

export default async function ClinicProfilePage({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  return <ClinicProfileView clinicId={clinicId} />;
}
