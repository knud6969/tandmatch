"use client";

import { useState } from "react";
import { LoginForm } from "@/views/components/auth/login-form";
import { PatientSignupForm } from "@/views/components/auth/patient-signup-form";
import { ConsentGate } from "@/views/components/case/consent-gate";
import { useSession } from "@/views/components/session/session-provider";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { LoadState } from "@/views/components/ui/load-state";

// Trin 2: konto og delingssamtykke (architecture 6.1, 4.3). Uden session vælger patienten at logge ind eller oprette konto, en
// anonym session konverteres (som på afsendelsessiden), og derefter gives delingssamtykket i gældende version. `consentOk` ejes
// af EmergencyFlow (null = hentes), som viser trin 3, når begge dele er på plads. Tilstanden i flowet bevares hele vejen.
export function EmergencyAccountStep({ consentOk, onConsent }: { consentOk: boolean | null; onConsent: () => void }) {
  const { state } = useSession();
  const [mode, setMode] = useState<"signup" | "login">("signup");

  if (state.status === "loading") return <LoadState loading error={null} onRetry={() => {}} />;
  const me = state.status === "ready" ? state.me : null;

  if (me && me.role !== "patient") {
    return (
      <Alert tone="warning" title="Log ind som patient for at bruge akutvejen">
        <p>Akutvejen er til patienter. Log ud, og log ind med en patientkonto.</p>
      </Alert>
    );
  }

  if (!me || me.isAnonymous) {
    return (
      <div className="flex flex-col gap-4" data-testid="akut-konto">
        <p className="text-base text-ink-muted">
          Du skal have en konto, før noget sendes til en klinik. Det tager under et minut, og dit valg af klinik og tid bevares.
        </p>
        {!me && (
          <div className="flex gap-2" role="group" aria-label="Har du en konto?">
            <Button variant={mode === "signup" ? "primary" : "secondary"} aria-pressed={mode === "signup"} onClick={() => setMode("signup")} className="flex-1">
              Opret konto
            </Button>
            <Button variant={mode === "login" ? "primary" : "secondary"} aria-pressed={mode === "login"} onClick={() => setMode("login")} className="flex-1">
              Log ind
            </Button>
          </div>
        )}
        {!me && mode === "login" ? <LoginForm naeste={null} onDone={() => {}} /> : <PatientSignupForm onDone={() => {}} />}
      </div>
    );
  }

  if (consentOk === null) return <LoadState loading error={null} onRetry={() => {}} />;
  if (!consentOk) return <ConsentGate type="health_data_sharing" onGranted={onConsent} actionLabel="Giv samtykke" />;
  return (
    <p className="text-base text-ink-muted" data-testid="akut-konto-klar">
      Du er logget ind, og dit samtykke til at dele din henvendelse med klinikken er givet.
    </p>
  );
}
