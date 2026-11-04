"use client";

import { useEffect, useRef } from "react";

// Flytter fokus til det første ugyldige felt (aria-invalid) i formularen, når `errors` ændres. Tastatur- og
// skærmlæserbrugere havner dermed ved den første fejl i stedet for at skulle lede efter den.
export function useFocusInvalid<T extends HTMLElement = HTMLFormElement>(errors: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const invalid = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) invalid.focus();
  }, [errors]);
  return ref;
}
