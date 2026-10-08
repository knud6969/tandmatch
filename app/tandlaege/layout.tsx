import type { ReactNode } from "react";
import { guardArea } from "@/middleware/areaGuard";
import { DentistVerificationBanner } from "@/views/components/session/area-banners";
import { Container } from "@/views/components/ui/container";

// Tandlægeområdet. Server component: rollen tjekkes på serveren, før noget indhold sendes (architecture 6.5).
// Verifikationsstatus vises altid tydeligt (klient-banner, bygget på /api/me).
export default async function DentistLayout({ children }: { children: ReactNode }) {
  await guardArea("dentist", "/tandlaege");
  return (
    <Container size="wide">
      <DentistVerificationBanner />
      {children}
    </Container>
  );
}
