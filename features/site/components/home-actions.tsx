"use client";

import { LinkButton } from "@/components/ui/button";
import { useSession } from "@/features/identity/ui";
import { AREA_HOME } from "@/lib/common/navigation/areas";

// Forsidens primære handlinger (features/site 6.1). En indlogget klinik går direkte til sine henvendelser.
export function HomeActions() {
  const { state } = useSession();
  const me = state.status === "ready" ? state.me : null;
  if (me?.role === "clinic") {
    return <LinkButton href={AREA_HOME.clinic}>Gå til henvendelser</LinkButton>;
  }
  return (
    <>
      <LinkButton href="/opret/klinik">Opret klinik</LinkButton>
      <LinkButton href="/login" variant="secondary">
        Log ind
      </LinkButton>
    </>
  );
}
