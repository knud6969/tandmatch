import type { ReactNode } from "react";
import { guardArea } from "@/app/_lib/guard-area";
import { Container } from "@/components/ui/container";

// Patientområdet. Server component: rollen tjekkes på serveren, før noget indhold sendes (architecture 6.5).
export default async function PatientLayout({ children }: { children: ReactNode }) {
  await guardArea("patient", "/patient");
  return <Container size="wide">{children}</Container>;
}
