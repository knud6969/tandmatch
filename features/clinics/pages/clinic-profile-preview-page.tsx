import type { Metadata } from "next";
import { ClinicProfilePreview } from "@/features/clinics/components/clinic-profile-preview";

export const metadata: Metadata = { title: "Forhåndsvisning af profilen" };

// Klinikkens egen profil, som patienter ser den i appen (features/clinics 6.5). Områdevagten i app/klinik/layout.tsx kræver
// rollen clinic; data er altid sessionens egen klinik.
export default function ClinicProfilePreviewPage() {
  return <ClinicProfilePreview />;
}
