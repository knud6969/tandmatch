import type { LatLng } from "@/lib/clinics/domain/location";
import { appleMapsDirectionsUrl, googleMapsDirectionsUrl } from "@/lib/clinics/domain/directions";

const LINK_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 text-base font-semibold text-brand-700 shadow-card hover:bg-surface-muted";

// Vejvisning til klinikken i en kortapp (clinics 6.3), som appens knap "Vis vej". Åbner i ny fane. Samme URL-byggere
// som appen (lib/clinics/domain/directions.ts).
export function DirectionsLinks({ name, location }: { name: string; location: LatLng }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <a href={googleMapsDirectionsUrl(location)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        Vejvisning i Google Maps
        <span className="sr-only">(åbner i ny fane)</span>
      </a>
      <a href={appleMapsDirectionsUrl(location, name)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        Vejvisning i Apple Maps
        <span className="sr-only">(åbner i ny fane)</span>
      </a>
    </div>
  );
}
