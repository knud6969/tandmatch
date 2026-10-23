"use client";

import { useEffect, useRef } from "react";
import { startVisiblePolling } from "@/lib/common/domain/polling";

// Kalder `callback` hvert `intervalMs` mens fanen er synlig og straks, når den bliver synlig igen. `intervalMs` null slår det fra.
export function usePolling(callback: () => void, intervalMs: number | null): void {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    if (intervalMs === null) return;
    return startVisiblePolling(() => latest.current(), intervalMs, document);
  }, [intervalMs]);
}
