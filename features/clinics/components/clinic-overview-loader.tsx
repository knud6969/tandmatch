"use client";

import { ClinicOverview } from "@/features/clinics/components/clinic-overview";
import { loadClinic } from "@/features/clinics/utils/clinic-loaders";
import { useLoad } from "@/platform/ui-utils/use-load";

// Opsætningsoversigten øverst på Klinikprofil (features/clinics/README.md 6.3). Fejler hentningen, vises intet her; formularen
// nedenunder viser selv sin fejl.
export function ClinicOverviewLoader() {
  const { data } = useLoad(loadClinic);
  return data ? <ClinicOverview clinic={data} /> : null;
}
