import type { ReactNode } from "react";
import { guardArea } from "@/middleware/areaGuard";

// Områdevagt for patienten (architecture 6.5): uden login til /login, anonym til /opret/patient, forkert rolle til eget område.
export default async function PatientAreaLayout({ children }: { children: ReactNode }) {
  await guardArea("patient", "/patient");
  return children;
}
