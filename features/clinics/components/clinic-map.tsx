"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, Circle, CircleMarker, MapContainer, Marker, Popup, ZoomControl, useMap } from "react-leaflet";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { LatLng } from "@/lib/clinics/domain/location";
import { BASIC_CLINIC_LABEL, VERIFIED_CLINIC_LABEL } from "@/lib/clinics/constants/clinic-texts";
import { TierBadge } from "@/features/clinics/components/tier-badge";
import { ClinicFacts, ClinicWhere } from "@/features/clinics/components/clinic-facts";
import { clinicProfileHref } from "@/features/clinics/utils/clinic-query";
import {
  DENMARK_CENTER,
  DENMARK_ZOOM,
  MAX_FIT_ZOOM,
  SINGLE_CLINIC_ZOOM,
  MAP_MAX_ZOOM,
  mapPoints,
} from "@/features/clinics/utils/map";
import { createVectorBaseLayer } from "@/features/clinics/utils/vector-base-layer";

// Markørerne er HTML med Tailwind-klasser fra temaet (ingen rå farver) og ligner appens (clinic-map.tsx i mobile/):
// runde med et kors; verificeret = udfyldt blå med hvid kant, basis = hvid med stiplet grå kant og gråt kors. Den valgte
// markør (åben popup eller kortet i listen under musen) er større med mørkeblå kant.
const PIN = 32;
const PIN_SELECTED = 42;
const ICON_CACHE = new Map<string, L.DivIcon>();

function markerIcon(tier: ClinicListItemDto["tier"], selected: boolean): L.DivIcon {
  const key = `${tier}:${selected}`;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;
  const size = selected ? PIN_SELECTED : PIN;
  const shape = selected ? "size-[42px] border-brand-800 shadow-raised" : "size-8 shadow-card";
  const look =
    tier === "full"
      ? `bg-brand-600 text-on-brand ${selected ? "" : "border-on-brand"}`
      : `border-dashed bg-surface text-ink-muted ${selected ? "" : "border-field-border"}`;
  const html = `<span class="flex items-center justify-center rounded-pill border-2 text-base font-bold leading-none ${shape} ${look}">&#10010;</span>`;
  const icon = L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
  ICON_CACHE.set(key, icon);
  return icon;
}

// Profilens nål: dråbeform i brand-farven som appens Marker med pinColor (Apple Maps).
const PROFILE_PIN = L.divIcon({
  html:
    '<svg viewBox="0 0 28 40" width="28" height="40" aria-hidden="true" class="drop-shadow-md">' +
    '<path class="fill-brand-600 stroke-on-brand" stroke-width="2" d="M14 1C6.8 1 1 6.7 1 13.8 1 23.5 14 39 14 39s13-15.5 13-25.2C27 6.7 21.2 1 14 1z"/>' +
    '<circle class="fill-on-brand" cx="14" cy="14" r="4.5"/></svg>',
  className: "",
  iconSize: [28, 40],
  iconAnchor: [14, 39],
});

// Baggrundskortet: OpenFreeMap-vektorfliser tegnet af MapLibre GL i Leaflets flisepanel (clinics 6.6). Krediteringen vises
// af Leaflets egen attributionskontrol.
function VectorBaseLayer() {
  const map = useMap();
  useEffect(() => {
    const layer = createVectorBaseLayer();
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map]);
  return null;
}

// Tilpasser udsnittet til markørerne (og udgangspunktet) og holder kortet i takt med sin beholder (fx når det vises efter
// et skift på mobil). Som appens regionForClinics: alle punkter med luft omkring.
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
      map.setView([points[0].lat, points[0].lng], SINGLE_CLINIC_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: MAX_FIT_ZOOM });
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
  // "directory": oversigten med popups og zoom. "profile": ét fast udsnit uden panorering eller zoom, som appens profilkort.
  variant?: "directory" | "profile";
  // Udgangspunktet for afstandene (ClinicListDto.origin) og afstandsgrænsen; vises som i appen.
  origin?: LatLng | null;
  radiusKm?: number | null;
  // Oversigtens filtre, som profillinket tager med (så "Alle klinikker" bevarer dem).
  profileSearch?: string;
};

export default function ClinicMap({
  clinics,
  hasServices,
  emergency,
  highlightedId = null,
  variant = "directory",
  origin = null,
  radiusKm = null,
  profileSearch = "",
}: ClinicMapProps) {
  const located = useMemo(() => clinics.filter((clinic) => clinic.location), [clinics]);
  const isProfile = variant === "profile";
  const points = useMemo(() => {
    const clinicPoints = mapPoints(clinics);
    return origin && !isProfile ? [...clinicPoints, { id: "udgangspunkt", ...origin }] : clinicPoints;
  }, [clinics, origin, isProfile]);
  // Klinikken med åben popup er valgt (som et tryk på en markør i appen).
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <MapContainer
      center={DENMARK_CENTER}
      zoom={DENMARK_ZOOM}
      scrollWheelZoom={!isProfile}
      dragging={!isProfile}
      touchZoom={!isProfile}
      doubleClickZoom={!isProfile}
      boxZoom={!isProfile}
      keyboard={!isProfile}
      maxZoom={MAP_MAX_ZOOM}
      zoomControl={false}
      attributionControl={false}
      className="size-full min-h-40 rounded-card"
    >
      <VectorBaseLayer />
      <AttributionControl prefix={false} position="bottomright" />
      {!isProfile && <ZoomControl position="topright" zoomInTitle="Zoom ind" zoomOutTitle="Zoom ud" />}
      <MapController points={points} />
      {origin && !isProfile && (
        <>
          {radiusKm !== null && radiusKm > 0 && (
            <Circle center={[origin.lat, origin.lng]} radius={radiusKm * 1000} interactive={false} pathOptions={{ className: "map-radius", weight: 1 }} />
          )}
          <CircleMarker center={[origin.lat, origin.lng]} radius={7} interactive={false} pathOptions={{ className: "map-origin", weight: 3, fillOpacity: 1 }} />
        </>
      )}
      {located.map((clinic) => {
        const full = clinic.tier === "full";
        const selected = clinic.id === highlightedId || clinic.id === openId;
        return (
          <Marker
            key={clinic.id}
            position={[clinic.location!.lat, clinic.location!.lng]}
            icon={isProfile ? PROFILE_PIN : markerIcon(clinic.tier, selected)}
            title={isProfile ? clinic.name : `${clinic.name}, ${full ? VERIFIED_CLINIC_LABEL : BASIC_CLINIC_LABEL}`}
            alt={clinic.name}
            interactive={!isProfile}
            keyboard={!isProfile}
            zIndexOffset={selected ? 1000 : full ? 500 : 0}
            eventHandlers={
              isProfile
                ? undefined
                : { popupopen: () => setOpenId(clinic.id), popupclose: () => setOpenId((id) => (id === clinic.id ? null : id)) }
            }
          >
            {!isProfile && (
              <Popup minWidth={220} maxWidth={300} autoPanPaddingTopLeft={[20, 20]} autoPanPaddingBottomRight={[60, 20]}>
                <div className="flex flex-col gap-2 text-ink">
                  <div>
                    <TierBadge tier={clinic.tier} />
                  </div>
                  <p className="text-base font-semibold leading-snug">{clinic.name}</p>
                  <ClinicWhere clinic={clinic} />
                  <ClinicFacts clinic={clinic} hasServices={hasServices} emergency={emergency} />
                  <Link
                    href={clinicProfileHref(clinic.id, profileSearch)}
                    className="map-popup-link inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-4 text-base font-semibold no-underline hover:bg-brand-700"
                  >
                    Se profil
                  </Link>
                </div>
              </Popup>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
