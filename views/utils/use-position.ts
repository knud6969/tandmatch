"use client";

import { useState } from "react";
import { roundPosition } from "@/lib/domain/position";

export type Position = { lat: number; lng: number };

// "Brug min position" (architecture 6.1, 6.6): browserens position afrundes og gemmes aldrig. Fælles for oversigtens filtre og /akut.
export function usePosition(onPosition: (position: Position) => void) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function request() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Din browser kan ikke finde din position. Skriv dit postnummer i stedet.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLocating(false);
        onPosition({ lat: roundPosition(result.coords.latitude), lng: roundPosition(result.coords.longitude) });
      },
      () => {
        setLocating(false);
        setError("Vi kunne ikke få din position. Tjek browserens tilladelser, eller skriv dit postnummer i stedet.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  return { locating, error, request, clearError: () => setError(null) };
}
