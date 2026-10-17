import type { Metadata } from "next";
import { Suspense } from "react";
import { ClinicProfileView } from "@/views/components/clinic-directory/clinic-profile-view";

export const metadata: Metadata = { title: "Klinik" };

export default async function ClinicProfilePage({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  return (
    <Suspense fallback={<p role="status" className="px-4 py-8 text-base text-ink-muted sm:px-6">Indlæser …</p>}>
      <ClinicProfileView clinicId={clinicId} />
    </Suspense>
  );
}
