"use client";

import { ClinicOverview } from "@/features/clinics/ui";
import { LeadInbox } from "@/features/leads/components/lead-inbox";
import { VerificationBanner } from "@/features/clinics/ui";
import { LoadState } from "@/components/ui/load-state";
import { loadClinic } from "@/features/clinics/ui";
import { useLoad } from "@/platform/ui-utils/use-load";

// Klinikkens forside: verificeringsbanneret øverst (kun ved "registered"), derefter indbakken og opsætningen. Klinikken hentes
// én gang og gives til både banner og oversigt.
export function ClinicHome() {
  const { data, error, loading, reload } = useLoad(loadClinic);
  return (
    <div className="flex flex-col gap-8">
      {data && <VerificationBanner status={data.status} />}
      <section aria-labelledby="henvendelser" className="flex flex-col gap-4">
        <h2 id="henvendelser" className="text-xl font-semibold text-ink">
          Henvendelser
        </h2>
        <LeadInbox />
      </section>
      {data ? <ClinicOverview clinic={data} /> : <LoadState loading={loading} error={error} onRetry={reload} />}
    </div>
  );
}
