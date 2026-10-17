import type { Metadata } from "next";
import { Suspense } from "react";
import { SendStep } from "@/views/components/case/send-step";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Send din sag" };

export default async function SendCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ klinikker?: string | string[] }>;
}) {
  const { caseId } = await params;
  const { klinikker } = await searchParams;
  return (
    <Container>
      <PageIntro title="Send din sag til klinikkerne">
        <p>Tjek dit valg, opret en konto, og giv samtykke, før din beskrivelse sendes. Du kan højst have tre aktive henvendelser pr. sag.</p>
      </PageIntro>
      <Suspense fallback={<p role="status" className="text-base text-ink-muted">Indlæser …</p>}>
        <SendStep caseId={caseId} clinicsParam={typeof klinikker === "string" ? klinikker : null} />
      </Suspense>
    </Container>
  );
}
