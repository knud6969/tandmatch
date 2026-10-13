import type { ReactNode } from "react";
import { guardArea } from "@/middleware/areaGuard";

// Områdevagt for klinikken (architecture 6.5): uden login til /login, forkert rolle til eget område.
export default async function ClinicAreaLayout({ children }: { children: ReactNode }) {
  await guardArea("clinic", "/klinik");
  return children;
}
