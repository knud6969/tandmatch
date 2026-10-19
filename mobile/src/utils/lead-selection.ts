import { useSyncExternalStore } from "react";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";

// Patientens valg af klinikker til en sag (architecture 13.4). Holdes i hukommelsen, så oversigten og profilen deler det.
export type LeadSelection = { ids: string[]; slots: number; contacted: string[] };

const EMPTY: LeadSelection = { ids: [], slots: MAX_ACTIVE_LEADS_PER_CASE, contacted: [] };
const store = new Map<string, LeadSelection>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getSelection(caseId: string): LeadSelection {
  return store.get(caseId) ?? EMPTY;
}

// Ren regel: højst `slots` klinikker, ingen dubletter, og kontaktede klinikker kan ikke vælges.
export function toggleId(ids: string[], id: string, slots: number, contacted: string[] = []): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (contacted.includes(id) || ids.length >= slots) return ids;
  return [...ids, id];
}

export function toggleClinic(caseId: string, clinicId: string) {
  const s = getSelection(caseId);
  store.set(caseId, { ...s, ids: toggleId(s.ids, clinicId, s.slots, s.contacted) });
  emit();
}

// Sætter pladser og kontaktede, når sagen er hentet; et eksisterende valg beskæres til de ledige pladser.
export function setLimits(caseId: string, slots: number, contacted: string[]) {
  const s = getSelection(caseId);
  const ids = s.ids.filter((id) => !contacted.includes(id)).slice(0, slots);
  store.set(caseId, { ids, slots, contacted });
  emit();
}

export function clearSelection(caseId: string) {
  store.delete(caseId);
  emit();
}

export function useSelection(caseId: string | undefined): LeadSelection {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => (caseId ? getSelection(caseId) : EMPTY),
    () => EMPTY,
  );
}

export function parseClinicIds(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_ACTIVE_LEADS_PER_CASE);
}

export const clinicsWord = (n: number) => (n === 1 ? "1 klinik" : `${n} klinikker`);

export type SendBlock = "closed" | "none" | "no_slots" | "not_ready" | "too_many" | "contacted" | "unavailable";

// Hvorfor sagen ikke kan sendes lige nu (null = klar). Serveren er den endelige vogter; det her er kun for en tydelig tekst.
export function sendBlockReason(
  caseDto: { status: string; canSend: boolean; leadCount: number; totalLeadCount: number },
  ids: string[],
  clinics: { id: string; canReceiveLeads: boolean }[],
  contacted: string[],
  slots: number,
): SendBlock | null {
  if (caseDto.status === "closed") return "closed";
  if (ids.length === 0) return "none";
  if (slots === 0) return "no_slots";
  if (!caseDto.canSend) return "not_ready";
  if (ids.length > slots) return "too_many";
  if (ids.some((id) => contacted.includes(id))) return "contacted";
  if (ids.some((id) => !clinics.find((c) => c.id === id)?.canReceiveLeads)) return "unavailable";
  return null;
}

export const SEND_BLOCK_TEXT: Record<SendBlock, string> = {
  closed: "Sagen er lukket og kan ikke sendes til flere klinikker.",
  none: "Du har ikke valgt nogen klinikker. Gå tilbage og vælg de klinikker, du vil kontakte.",
  no_slots: "Du kan ikke kontakte flere klinikker lige nu med denne sag.",
  not_ready: "Din beskrivelse er ikke klar til at blive sendt. Godkend opsummeringen, og angiv behandlinger, tidsrum og postnummer.",
  too_many: "Du har valgt for mange klinikker. Gå tilbage og ret dit valg.",
  contacted: "Du har allerede kontaktet en af klinikkerne med sagen. Gå tilbage og vælg en anden.",
  unavailable: "En af klinikkerne kan ikke kontaktes. Kun verificerede klinikker kan modtage henvendelser via TandMatch.",
};
