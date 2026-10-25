"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/features/identity/ui";
import { leadNeedsAction } from "@/lib/leads/domain/leads";
import type { ClinicLeadListItemDto } from "@/lib/leads/types/leads";
import { startVisiblePolling } from "@/lib/common/domain/polling";
import { apiRequest, ApiRequestError } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";

// Én delt hentning af klinikkens leads (features/clinics/README.md 6.3): indbakken, lead-kortets "Næste henvendelse" og tallet
// på fanen Henvendelser bruger de samme data. Der hentes, når den første komponent abonnerer, og derefter hvert 20. sekund,
// mens fanen er synlig og mindst én komponent abonnerer. Data hører til én bruger: skifter kontoen, nulstilles alt, så en ny
// klinik aldrig ser den forriges leads, heller ikke et øjeblik.

// Under 30 sekunder, så et lead fra appen ses uden genindlæsning.
export const LEADS_POLL_MS = 20_000;

export type ClinicLeadsState = {
  data: ClinicLeadListItemDto[] | null;
  error: string | null;
  errorCode: string | null;
  loading: boolean;
};

const INITIAL: ClinicLeadsState = { data: null, error: null, errorCode: null, loading: true };

let state: ClinicLeadsState = INITIAL;
let owner: string | null = null;
let subscribers = 0;
let generation = 0;
let inflight: Promise<void> | null = null;
let stopPolling: (() => void) | null = null;
const listeners = new Set<() => void>();

function setState(next: ClinicLeadsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function updatePolling() {
  const shouldPoll = subscribers > 0 && state.errorCode === null && typeof document !== "undefined";
  if (shouldPoll && !stopPolling) stopPolling = startVisiblePolling(() => void fetchLeads(true), LEADS_POLL_MS, document);
  if (!shouldPoll && stopPolling) {
    stopPolling();
    stopPolling = null;
  }
}

// Baggrundshentning beholder de viste data ved fejl; en forgrundshentning viser fejlen.
function fetchLeads(background: boolean): Promise<void> {
  if (inflight) return inflight;
  const started = generation;
  const request: Promise<void> = apiRequest<{ leads: ClinicLeadListItemDto[] }>("/api/leads")
    .then(
      (result) => {
        if (started === generation) setState({ data: result.leads, error: null, errorCode: null, loading: false });
      },
      (error: unknown) => {
        if (started !== generation || (background && state.data)) return;
        setState({
          data: null,
          error: apiErrorMessage(error),
          errorCode: error instanceof ApiRequestError ? error.code : null,
          loading: false,
        });
      },
    )
    .finally(() => {
      if (inflight === request) inflight = null;
      updatePolling();
    });
  inflight = request;
  return request;
}

function resetFor(nextOwner: string) {
  generation += 1;
  inflight = null;
  owner = nextOwner;
  setState(INITIAL);
}

// Hent igen nu (fx efter et svar på et lead). Viser ikke indlæsning, hvis der allerede er data.
export function refreshClinicLeads(): void {
  if (owner === null) return;
  generation += 1;
  inflight = null;
  if (!state.data) setState({ ...INITIAL });
  void fetchLeads(state.data !== null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => INITIAL;

// Abonnerer på klinikkens leads. Kun for en indlogget klinik; ellers tomt og ingen hentning.
export function useClinicLeads(): ClinicLeadsState & { reload: () => void } {
  const { state: session } = useSession();
  const clinicId = session.status === "ready" && session.me?.role === "clinic" ? session.me.id : null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (clinicId === null) return;
    if (owner !== clinicId) resetFor(clinicId);
    subscribers += 1;
    // Ved hver ny visning hentes der igen (stille, hvis der allerede er data), så listen er frisk efter navigation.
    void fetchLeads(state.data !== null);
    updatePolling();
    return () => {
      subscribers -= 1;
      updatePolling();
    };
  }, [clinicId]);

  const current = clinicId !== null && owner === clinicId ? snapshot : INITIAL;
  return { ...current, reload: refreshClinicLeads };
}

// Antallet af henvendelser, der kræver handling (status sent eller ulæste beskeder). 0 uden data.
export function countNeedingAction(leads: ClinicLeadListItemDto[] | null): number {
  return leads ? leads.filter(leadNeedsAction).length : 0;
}

export function useLeadsNeedingActionCount(): number {
  return countNeedingAction(useClinicLeads().data);
}

// Indbakkens filtervalg huskes, mens siden er åben (også ved skift mellem /klinik og et lead), men ikke på tværs af konti.
let rememberedFilter: { owner: string | null; value: string } | null = null;
export function rememberInboxFilter(value: string): void {
  rememberedFilter = { owner, value };
}
export function rememberedInboxFilter(): string | null {
  return rememberedFilter && rememberedFilter.owner === owner ? rememberedFilter.value : null;
}
