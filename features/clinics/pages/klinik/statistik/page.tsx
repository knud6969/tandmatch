import type { Metadata } from "next";
import { CLINIC_STATS_PERIODS, DEFAULT_CLINIC_STATS_PERIOD, STATS_PAGE_TITLE } from "@/lib/clinics/constants/stats";
import type { ClinicStatsPeriodDays } from "@/lib/clinics/types/stats";
import { StatsOverview } from "@/features/clinics/components/stats-overview";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: STATS_PAGE_TITLE };

// ?dage=30|90|365 (standard 30); andre værdier giver standardperioden.
function periodFrom(value: string | string[] | undefined): ClinicStatsPeriodDays {
  const found = CLINIC_STATS_PERIODS.find((days) => String(days) === value);
  return found ?? DEFAULT_CLINIC_STATS_PERIOD;
}

export default async function ClinicStatsPage({ searchParams }: { searchParams: Promise<{ dage?: string | string[] }> }) {
  const { dage } = await searchParams;
  return (
    <Container size="wide">
      <PageIntro title={STATS_PAGE_TITLE}>
        <p>Henvendelser, svartid og bookinger for jeres klinik.</p>
      </PageIntro>
      <StatsOverview days={periodFrom(dage)} />
    </Container>
  );
}
