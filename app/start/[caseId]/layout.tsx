import type { ReactNode } from "react";
import { guardCaseFlow } from "@/middleware/areaGuard";

// Sagsvagt (architecture 6.1, 6.5): patienter, også anonyme. Ejerskab af sagen tjekkes af API'et.
export default async function CaseFlowLayout({ children }: { children: ReactNode }) {
  await guardCaseFlow();
  return children;
}
