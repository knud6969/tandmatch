import type { ReactNode } from "react";
import { guardWizard } from "@/middleware/areaGuard";

// Wizarden. Anonyme patienter er tilladt, fordi det er deres kladde (architecture 6.1, 6.5).
export default async function RequestWizardLayout({ children }: { children: ReactNode }) {
  await guardWizard();
  return children;
}
