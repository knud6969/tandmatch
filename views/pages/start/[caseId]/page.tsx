import type { Metadata } from "next";
import { CaseFlow } from "@/views/components/case/case-flow";

export const metadata: Metadata = { title: "Din sag" };

export default async function CaseFlowPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseFlow caseId={caseId} />;
}
