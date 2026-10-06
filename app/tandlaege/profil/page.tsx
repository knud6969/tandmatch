import type { Metadata } from "next";
import { DentistProfile } from "@/components/dentist/dentist-profile";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Profil" };

// Egen profil og klinik (architecture 6.3, 10.8). Data hentes via /api/dentists/me og /api/clinics/me.
export default function DentistProfilePage() {
  return (
    <>
      <PageIntro title="Profil">
        <p>Din klinik og dine oplysninger. Patienter ser klinikken, når din profil er verificeret.</p>
      </PageIntro>
      <DentistProfile />
    </>
  );
}
