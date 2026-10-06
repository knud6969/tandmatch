// Tandlægesvar (architecture 4.3, 10.6). Patienten og tandlægen ser samme form; tandlægen ser kun eget svar.

export type ResponseStatus = "sent" | "withdrawn";
export type PatientDecision = "none" | "chosen" | "declined";

export type ResponseDto = {
  id: string;
  requestId: string;
  status: ResponseStatus;
  patientDecision: PatientDecision;
  assessment: string;
  priceMin: number; // hele kroner
  priceMax: number;
  priceNote: string | null;
  firstAvailableAt: string | null;
  offer: string | null;
  validUntil: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  dentist: {
    id: string;
    fullName: string;
    title: string | null;
    clinicName: string | null;
    clinicCity: string | null;
  } | null; // null hvis tandlægen ikke længere er synlig (fx ikke verificeret)
};
