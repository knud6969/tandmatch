"use client";

import { ClinicSetupNotice, VerificationBanner, loadClinic } from "@/features/clinics/ui";
import { InboxLayout, NoLeadSelected } from "@/features/leads/components/inbox-layout";
import { useLoad } from "@/platform/ui-utils/use-load";

// Klinikkens forside (features/clinics/README.md 6.3): verificeringsbanneret (kun ved "registered") og én linje om opsætningen,
// når noget mangler; derefter indbakken. Klinikken hentes én gang til banner og opsætningslinje. Fejler hentningen, vises
// indbakken alligevel; opsætningen kan ses under Klinikprofil.
export function ClinicHome() {
  const { data } = useLoad(loadClinic);
  return (
    <div className="flex flex-col gap-4">
      {data && <VerificationBanner status={data.status} />}
      {data && <ClinicSetupNotice clinic={data} />}
      <InboxLayout>
        <NoLeadSelected />
      </InboxLayout>
    </div>
  );
}
