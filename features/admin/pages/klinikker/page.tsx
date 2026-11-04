import type { Metadata } from "next";
import { ADMIN_CLINICS_TITLE } from "@/lib/admin/constants/admin";
import { AdminClinics } from "@/features/admin/components/admin-clinics";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: ADMIN_CLINICS_TITLE };

export default function AdminClinicsPage() {
  return (
    <Container size="wide">
      <PageIntro title={ADMIN_CLINICS_TITLE}>
        <p>Verificér en klinik, eller sæt den på pause. Højst 200 klinikker vises ad gangen.</p>
      </PageIntro>
      <AdminClinics />
    </Container>
  );
}
