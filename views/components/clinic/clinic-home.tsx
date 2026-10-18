"use client";

import { ClinicOverview } from "@/views/components/clinic/clinic-overview";
import { LeadInbox } from "@/views/components/clinic/lead-inbox";
import { VerificationBanner } from "@/views/components/clinic/verification-banner";
import { LoadState } from "@/views/components/ui/load-state";
import { loadClinic } from "@/views/utils/clinic-loaders";
import { useLoad } from "@/views/utils/use-load";

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
