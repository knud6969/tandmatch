"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";

const KEY = "tm-home-flash";

// Kort besked efter en handling, der sender brugeren til forsiden (fx en anonym sessions slettet).
// sessionStorage i stedet for en forespørgselsparameter, fordi siden allerede er forladt, da beskeden skal vises.
export function HomeFlash() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Læsningen er udskudt til en mikrotask, så setState ikke sker synkront i selve effekten.
    Promise.resolve().then(() => {
      try {
        const stored = sessionStorage.getItem(KEY);
        if (stored) {
          setMessage(stored);
          sessionStorage.removeItem(KEY);
        }
      } catch {
        // sessionStorage kan være blokeret (fx privat tilstand). Beskeden udelades, men handlingen er allerede udført.
      }
    });
  }, []);

  if (!message) return null;
  return (
    <Alert tone="success" role="status">
      {message}
    </Alert>
  );
}
