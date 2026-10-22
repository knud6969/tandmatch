"use client";

import dynamic from "next/dynamic";

// Leaflet kræver `window`, så kortet indlæses kun i browseren (architecture 6.6). Pladsholderen holder på pladsen.
export const ClinicMapLazy = dynamic(() => import("@/features/clinics/components/clinic-map"), {
  ssr: false,
  loading: () => (
    <div role="status" className="flex size-full min-h-64 items-center justify-center rounded-card bg-surface-muted text-base text-ink-muted">
      Indlæser kort …
    </div>
  ),
});
