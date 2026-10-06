import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientDecision, ResponseStatus } from "@/lib/types/responses";
import { ApiError, notFound } from "@/server/http/api";

// Dataadgang for tandlægesvar (architecture 4.3, 5.4). RLS afgør synlighed; API'et tilføjer kun ejerskabstjek.
// Kolonnenavne forlader ikke denne fil.

const RESPONSE_COLUMNS =
  "id, request_id, dentist_id, assessment, price_min, price_max, price_note, first_available_at, offer, valid_until, status, patient_decision, created_at, updated_at, dentists(id, full_name, title, clinics(name, city))";

type ClinicEmbed = { name: string; city: string } | null;
type DentistEmbed = {
  id: string;
  full_name: string;
  title: string | null;
  clinics: ClinicEmbed | ClinicEmbed[];
} | null;

type ResponseRow = {
  id: string;
  request_id: string;
  dentist_id: string;
  assessment: string;
  price_min: number;
  price_max: number;
  price_note: string | null;
  first_available_at: string | null;
  offer: string | null;
  valid_until: string | null;
  status: ResponseStatus;
  patient_decision: PatientDecision;
  created_at: string;
  updated_at: string;
  dentists: DentistEmbed | DentistEmbed[];
};

export type ResponseRecord = {
  id: string;
  requestId: string;
  dentistId: string;
  assessment: string;
  priceMin: number;
  priceMax: number;
  priceNote: string | null;
  firstAvailableAt: string | null;
  offer: string | null;
  validUntil: string | null;
  status: ResponseStatus;
  patientDecision: PatientDecision;
  createdAt: string;
  updatedAt: string;
  dentist: {
    id: string;
    fullName: string;
    title: string | null;
    clinicName: string | null;
    clinicCity: string | null;
  } | null;
};

// PostgREST returnerer embeds som objekt eller array afhængigt af relationen. Her tages første element.
function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toRecord(row: ResponseRow): ResponseRecord {
  const dentist = first(row.dentists);
  const clinic = dentist ? first(dentist.clinics) : null;
  return {
    id: row.id,
    requestId: row.request_id,
    dentistId: row.dentist_id,
    assessment: row.assessment,
    priceMin: row.price_min,
    priceMax: row.price_max,
    priceNote: row.price_note,
    firstAvailableAt: row.first_available_at,
    offer: row.offer,
    validUntil: row.valid_until,
    status: row.status,
    patientDecision: row.patient_decision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dentist: dentist
      ? {
          id: dentist.id,
          fullName: dentist.full_name,
          title: dentist.title,
          clinicName: clinic?.name ?? null,
          clinicCity: clinic?.city ?? null,
        }
      : null,
  };
}

// RLS: patienten (ejer) ser alle svar på forespørgslen, tandlægen kun sit eget (0 eller 1).
export async function listResponsesForRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<ResponseRecord[]> {
  const { data, error } = await supabase
    .from("responses")
    .select(RESPONSE_COLUMNS)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("responses: list fejlede");
  return (data as unknown as ResponseRow[]).map(toRecord);
}

export async function getResponse(supabase: SupabaseClient, responseId: string): Promise<ResponseRecord | null> {
  const { data, error } = await supabase
    .from("responses")
    .select(RESPONSE_COLUMNS)
    .eq("id", responseId)
    .maybeSingle();
  if (error) throw new Error("responses: select fejlede");
  return data ? toRecord(data as unknown as ResponseRow) : null;
}

export type ResponseInsert = {
  requestId: string;
  dentistId: string;
  assessment: string;
  priceMin: number;
  priceMax: number;
  priceNote: string | null;
  firstAvailableAt: string | null;
  offer: string | null;
  validUntil: string | null;
};

// Fejlkoder fra databasen oversættes her (SQLSTATE, ikke beskedtekst).
// 23505: allerede svaret. 42501: RLS afviser (ikke modtager, ikke verificeret, lukket). 23514: constraint.
export async function insertResponse(
  supabase: SupabaseClient,
  values: ResponseInsert,
): Promise<ResponseRecord> {
  const { data, error } = await supabase
    .from("responses")
    .insert({
      request_id: values.requestId,
      dentist_id: values.dentistId,
      assessment: values.assessment,
      price_min: values.priceMin,
      price_max: values.priceMax,
      price_note: values.priceNote,
      first_available_at: values.firstAvailableAt,
      offer: values.offer,
      valid_until: values.validUntil,
    })
    .select(RESPONSE_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "ALREADY_RESPONDED", "Du har allerede svaret på denne forespørgsel.");
    }
    if (error.code === "42501") {
      throw new ApiError(409, "REQUEST_CLOSED", "Forespørgslen er ikke længere åben for svar.");
    }
    if (error.code === "23514") {
      throw new ApiError(400, "VALIDATION_ERROR", "Ugyldige oplysninger. Tjek felterne og prøv igen.");
    }
    throw new Error("responses: insert fejlede");
  }
  if (!data) throw new Error("responses: insert gav ingen række");
  return toRecord(data as unknown as ResponseRow);
}

// Returnerer null, hvis RLS ikke tillader opdateringen (fx svaret er trukket tilbage eller forespørgslen er udløbet).
// Fejlkoder: 42501 ved ulovlig ændring af låste felter, P0001 INVALID_TRANSITION, 23514 ved constraint.
export async function updateResponse(
  supabase: SupabaseClient,
  responseId: string,
  patch: Record<string, unknown>,
): Promise<ResponseRecord | null> {
  const { data, error } = await supabase
    .from("responses")
    .update(patch)
    .eq("id", responseId)
    .select(RESPONSE_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23514") {
      throw new ApiError(400, "VALIDATION_ERROR", "Ugyldige oplysninger. Tjek felterne og prøv igen.");
    }
    if (error.code === "42501") {
      throw notFound();
    }
    throw new Error("responses: update fejlede");
  }
  return data ? toRecord(data as unknown as ResponseRow) : null;
}
