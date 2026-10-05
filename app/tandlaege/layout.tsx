import type { ReactNode } from "react";
import { guardArea } from "@/app/_lib/guard-area";
import { DentistVerificationBanner } from "@/components/session/area-banners";
import { Container } from "@/components/ui/container";

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
