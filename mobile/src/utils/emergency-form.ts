import { EMERGENCY_DESCRIPTION_MAX, EMERGENCY_DESCRIPTION_MIN } from "@/lib/leads/constants/leads";
import { emergencyLeadSchema } from "@/lib/leads/schemas/leads";
import { contactNameSchema } from "@/lib/booking/schemas/bookings";
import { phoneSchema } from "@/lib/common/schemas/phone";
import { EMERGENCY_HOLD_MINUTES } from "@/lib/booking/constants/bookings";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { ServiceDto, ServiceGroupDto } from "@/lib/clinics/types/services";
import { DEFAULT_FILTERS, buildClinicsQuery } from "~/utils/clinic-filters";
import { isPostalCode } from "~/utils/clinic-filters";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";

// Akutvejen (architecture 10.11, 13.4): hvilke klinikker og behandlinger der tilbydes, og formularen.

export const EMERGENCY_DESCRIPTION_LIMITS = { min: EMERGENCY_DESCRIPTION_MIN, max: EMERGENCY_DESCRIPTION_MAX } as const;

// Behandlinger af typen "akut" fra kataloget (kategorien afgør, ikke navnet).
export const emergencyServices = (groups: ServiceGroupDto[]): ServiceDto[] =>
  groups.flatMap((g) => g.services).filter((s) => s.category === "emergency");

// Forespørgslen til klinikoversigten: kun klinikker med akuttid, den tidligste først. Postnummer bruges kun, hvis det er gyldigt.
export function emergencyClinicsQuery(postalCode: string | null): string {
  const valid = postalCode !== null && isPostalCode(postalCode);
  return buildClinicsQuery({ ...DEFAULT_FILTERS, emergency: true, postalCode: valid ? postalCode : "", sort: "first_available" });
}

// Kun klinikker, der kan kontaktes (verificerede) og har en akuttid, kan vælges.
export const selectableEmergencyClinics = (clinics: ClinicListItemDto[]) => clinics.filter((c) => c.canReceiveLeads && c.firstEmergencyAt !== null);

export type EmergencyValues = {
  clinicId: string | null;
  serviceId: string | null;
  startsAt: string | null;
  description: string;
  contactName: string;
  contactPhone: string;
};
export type EmergencyField = "serviceId" | "startsAt" | "description" | "contactName" | "contactPhone";

export const EMERGENCY_PICK_TEXT = { serviceId: "Vælg en behandling.", startsAt: "Vælg en ledig tid." } as const;

// Validerer med samme skema som serveren; felter uden egen tekst fra skemaet får en kort dansk tekst.
export function parseEmergency(values: EmergencyValues): { ok: true; data: ReturnType<typeof emergencyLeadSchema.parse> } | { ok: false; errors: FieldErrors<EmergencyField> } {
  const parsed = emergencyLeadSchema.safeParse({
    clinicId: values.clinicId ?? "",
    serviceId: values.serviceId ?? "",
    startsAt: values.startsAt ?? "",
    description: values.description,
    contactName: values.contactName,
    contactPhone: values.contactPhone,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = fieldErrorsFrom<EmergencyField>(parsed.error);
  if (!values.serviceId) errors.serviceId = EMERGENCY_PICK_TEXT.serviceId;
  if (!values.startsAt) errors.startsAt = EMERGENCY_PICK_TEXT.startsAt;
  if (!contactNameSchema.safeParse(values.contactName).success && !errors.contactName) errors.contactName = "Angiv dit navn.";
  if (!phoneSchema.safeParse(values.contactPhone).success && !errors.contactPhone) errors.contactPhone = "Angiv et gyldigt telefonnummer.";
  return { ok: false, errors };
}

// Forklaring til kvitteringen: tiden er reserveret, ikke bekræftet, før klinikken har svaret.
export const EMERGENCY_HOLD_TEXT = `Tiden er reserveret til dig i op til ${EMERGENCY_HOLD_MINUTES} minutter, mens klinikken svarer. Klinikken laver den endelige vurdering. Svarer klinikken ikke, kan du vælge en anden klinik.`;
