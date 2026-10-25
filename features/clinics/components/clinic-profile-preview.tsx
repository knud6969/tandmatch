"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { ClinicProfileDto, OwnClinicDto } from "@/lib/clinics/types/clinics";
import { PROFILE_PREVIEW_LABEL } from "@/lib/clinics/constants/clinic-texts";
import { Alert } from "@/components/ui/alert";
import { LoadState } from "@/components/ui/load-state";
import { ClinicProfileContent } from "@/features/clinics/components/clinic-profile-view";
import { loadClinic } from "@/features/clinics/utils/clinic-loaders";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useLoad } from "@/platform/ui-utils/use-load";

type Preview = { profile: ClinicProfileDto; verified: boolean };

// Klinikkens forhåndsvisning af sin offentlige profil (features/clinics 6.5). Data er altid sessionens egen klinik
// (GET /api/clinics/me, ejer-tjek på serveren). En verificeret klinik vises med den offentlige profil, så stjerner og første
// ledige tid er dem, patienten ser; en `registered` klinik er ikke offentlig, så dens egne data vises på fuldt niveau.
export function ClinicProfilePreview() {
  const loader = useCallback(async (): Promise<Preview> => {
    const own: OwnClinicDto = await loadClinic();
    if (own.status !== "verified") return { profile: own, verified: false };
    try {
      return { profile: await apiRequest<ClinicProfileDto>(`/api/clinics/${own.id}`), verified: true };
    } catch {
      return { profile: own, verified: true };
    }
  }, []);
  const { data, loading, error, reload } = useLoad(loader);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/klinik/profil" className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
        ← Tilbage til klinikprofilen
      </Link>
      <Alert tone="warning" title={PROFILE_PREVIEW_LABEL}>
        {data && !data.verified ? (
          <p>
            Klinikken er ikke offentlig endnu, så patienterne kan ikke se profilen. Sådan kommer den til at se ud, når klinikken er synlig.
          </p>
        ) : (
          <p>Det er de samme oplysninger og den samme rækkefølge, som patienterne ser i appen. Ret oplysningerne på klinikprofilen og de andre opsætningssider.</p>
        )}
      </Alert>
      {data ? (
        <div data-testid="profil-forhaandsvisning">
          <ClinicProfileContent clinic={data.profile} mode="preview" verified={data.verified} />
        </div>
      ) : (
        <LoadState loading={loading} error={error} onRetry={reload} />
      )}
    </div>
  );
}
