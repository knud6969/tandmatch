"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";

// Fejl for en hel formular eller handling, placeret lige over knappen eller formularen. Når den vises (eller teksten
// ændres), flyttes fokus hertil og den rulles ind i billedet, så tastatur- og skærmlæserbrugere ser den med det samme.
export function FormError({ message, children }: { message: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [message]);
  return (
    <div ref={ref} tabIndex={-1} className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <Alert tone="danger" role="alert">
        {message}
        {children}
      </Alert>
    </div>
  );
}
