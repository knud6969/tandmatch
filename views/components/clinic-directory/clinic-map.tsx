"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { ClinicListItemDto } from "@/lib/types/clinics";
import { TierBadge } from "@/views/components/clinic-directory/tier-badge";
import { ClinicFacts, ClinicWhere } from "@/views/components/clinic-directory/clinic-facts";
import { DENMARK_CENTER, DENMARK_ZOOM, MAP_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL, mapPoints } from "@/views/utils/map";

// Markørerne er HTML med Tailwind-klasser fra temaet (ingen rå farver). Verificeret: stor, udfyldt blå med hak.
// Basis: lille, hvid med grå kant og prik. Den fremhævede markør (hover på kort i listen) får en ring.
const ICON_CACHE = new Map<string, L.DivIcon>();

function markerIcon(tier: ClinicListItemDto["tier"], highlighted: boolean): L.DivIcon {
  const key = `${tier}:${highlighted}`;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;
  const ring = highlighted ? "ring-4 ring-brand-300" : "";
  const html =
    tier === "full"
      ? `<span class="flex size-9 items-center justify-center rounded-pill border-2 border-surface bg-brand-600 text-base font-bold text-on-brand shadow-raised ${ring}">&#10003;</span>`
      : `<span class="flex size-6 items-center justify-center rounded-pill border-2 border-field-border bg-surface shadow-card ${ring}"><span class="size-2 rounded-pill bg-field-border"></span></span>`;
  const size = tier === "full" ? 36 : 24;
  const icon = L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
  ICON_CACHE.set(key, icon);
  return icon;
}

// Tilpasser udsnittet til markørerne og holder kortet i takt med sin beholder (fx når det vises efter et skift på mobil).
function MapController({ points }: { points: { id: string; lat: number; lng: number }[] }) {
  const map = useMap();
  const [sizeTick, setSizeTick] = useState(0);
  const lastWidth = useRef(0);
  const pointsKey = points.map((p) => `${p.id}:${p.lat}:${p.lng}`).join("|");

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const width = container.clientWidth;
      if (lastWidth.current === 0 && width > 0) setSizeTick((tick) => tick + 1);
      lastWidth.current = width;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (map.getContainer().clientWidth === 0) return; // skjult; tilpasses, når kortet vises
    if (points.length === 0) {
      map.setView(DENMARK_CENTER, DENMARK_ZOOM);
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pointsKey er nøglen til points.
  }, [map, pointsKey, sizeTick]);

  return null;
}

type ClinicMapProps = {
  clinics: ClinicListItemDto[];
  hasServices: boolean;
  emergency: boolean;
  highlightedId?: string | null;
  // Profilsiden viser kun én klinik og behøver ikke popup.
  popups?: boolean;
};

export default function ClinicMap({ clinics, hasServices, emergency, highlightedId = null, popups = true }: ClinicMapProps) {
  const located = useMemo(() => clinics.filter((clinic) => clinic.location), [clinics]);
  const points = useMemo(() => mapPoints(clinics), [clinics]);

  return (
    <MapContainer
      center={DENMARK_CENTER}
      zoom={DENMARK_ZOOM}
      scrollWheelZoom
      attributionControl={false}
      className="size-full min-h-64 rounded-card"
    >
      <TileLayer url={TILE_URL} maxZoom={TILE_MAX_ZOOM} attribution={MAP_ATTRIBUTION} />
      <AttributionControl prefix={false} position="bottomright" />
      <MapController points={points} />
      {located.map((clinic) => (
        <Marker
          key={clinic.id}
          position={[clinic.location!.lat, clinic.location!.lng]}
          icon={markerIcon(clinic.tier, clinic.id === highlightedId)}
          title={`${clinic.name}${clinic.tier === "full" ? " (verificeret)" : ""}`}
          zIndexOffset={clinic.id === highlightedId ? 1000 : clinic.tier === "full" ? 500 : 0}
        >
          {popups && (
            <Popup minWidth={220} maxWidth={300} autoPanPaddingTopLeft={[60, 20]}>
              <div className="flex flex-col gap-2 text-ink">
                <div>
                  <TierBadge tier={clinic.tier} />
                </div>
                <p className="text-base font-semibold leading-snug">{clinic.name}</p>
                <ClinicWhere clinic={clinic} />
                <ClinicFacts clinic={clinic} hasServices={hasServices} emergency={emergency} />
                <Link
                  href={`/klinikker/${clinic.id}`}
                  className="map-popup-link inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-4 text-base font-semibold no-underline hover:bg-brand-700"
                >
                  Se profil
                </Link>
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}
