"use client";

import { ANONYMOUS_SESSION_HOURS } from "@/lib/constants/sessions";
import { useSession } from "@/views/components/session/session-provider";
import { Alert } from "@/views/components/ui/alert";
import { formatDateTime } from "@/views/utils/format";

// Vises for anonyme patienter i sagsflowet (architecture 6.1): sagen gemmes kun midlertidigt, og en konto kræves for at sende.
export function AnonymousPatientBanner() {
  const { state } = useSession();
  const me = state.status === "ready" ? state.me : null;
  if (!me?.isAnonymous) return null;
  return (
    <Alert tone="info" title="Du er anonym" >
      <p data-testid="anonym-banner">
        Din sag gemmes i {ANONYMOUS_SESSION_HOURS} timer
        {me.anonymousExpiresAt ? ` (til ${formatDateTime(me.anonymousExpiresAt)})` : ""} og slettes derefter. Du kan chatte og beskrive
        dit problem uden konto, men du skal oprette en konto, før noget sendes til en klinik. Det gør du i næste skridt.
      </p>
    </Alert>
  );
}
