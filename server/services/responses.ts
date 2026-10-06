import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { createResponseSchema, patchResponseSchema } from "@/lib/schemas/responses";
import type { ResponseDto } from "@/lib/types/responses";
import { ApiError, notFound } from "@/server/http/api";
import { requireOwnRequest } from "@/server/models/requests";
import { getRecipientRequestStatus } from "@/server/models/inbox";
import { isOpenForResponses } from "@/lib/domain/request-open";
import {
  decideResponse,
  getResponse,
  insertResponse,
  listResponsesForRequest,
  updateResponse,
  type ResponseRecord,
} from "@/server/models/responses";
import { requireVerifiedDentist } from "@/server/services/dentists";

type CreateResponseInput = z.infer<typeof createResponseSchema>;
type PatchResponseInput = z.infer<typeof patchResponseSchema>;

export function toResponseDto(record: ResponseRecord): ResponseDto {
  return {
    id: record.id,
    requestId: record.requestId,
    status: record.status,
    withdrawn: record.status === "withdrawn",
    patientDecision: record.patientDecision,
    assessment: record.assessment,
    priceMin: record.priceMin,
    priceMax: record.priceMax,
    priceNote: record.priceNote,
    firstAvailableAt: record.firstAvailableAt,
    offer: record.offer,
    validUntil: record.validUntil,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    dentist: record.dentist,
  };
}

// En tandlæge svarer én gang pr. forespørgsel (unik i databasen). RLS kontrollerer modtagerskab og åbenhed.
export async function createResponse(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
  input: CreateResponseInput,
): Promise<ResponseDto> {
  await requireVerifiedDentist(supabase, userId);
  // Kun modtagere af en sendt forespørgsel får en status. Andre får samme 404 som ved manglende id.
  const request = await getRecipientRequestStatus(supabase, requestId);
  if (!request) throw notFound();
  if (!isOpenForResponses(request.status, request.expiresAt)) {
    throw new ApiError(409, "REQUEST_CLOSED", "Forespørgslen er ikke længere åben for svar.");
  }

  const record = await insertResponse(supabase, {
    requestId,
    dentistId: userId,
    assessment: input.assessment,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    priceNote: input.priceNote || null,
    firstAvailableAt: input.firstAvailableAt ?? null,
    offer: input.offer || null,
    validUntil: input.validUntil ?? null,
  });
  return toResponseDto(record);
}

// Opdatering kun mens patienten ikke har valgt, svaret ikke er trukket tilbage, og forespørgslen er åben.
export async function updateOwnResponse(
  supabase: SupabaseClient,
  userId: string,
  responseId: string,
  input: PatchResponseInput,
): Promise<ResponseDto> {
  await requireVerifiedDentist(supabase, userId);
  const current = await getResponse(supabase, responseId);
  if (!current || current.dentistId !== userId) throw notFound();
  if (current.patientDecision !== "none") {
    throw new ApiError(409, "RESPONSE_LOCKED", "Patienten har truffet et valg. Svaret kan ikke længere ændres.");
  }
  if (current.status === "withdrawn") {
    throw new ApiError(409, "RESPONSE_WITHDRAWN", "Svaret er trukket tilbage.");
  }
  const request = await getRecipientRequestStatus(supabase, current.requestId);
  if (!request || !isOpenForResponses(request.status, request.expiresAt)) {
    throw new ApiError(409, "REQUEST_CLOSED", "Forespørgslen er ikke længere åben for svar.");
  }

  const mergedMin = input.priceMin ?? current.priceMin;
  const mergedMax = input.priceMax ?? current.priceMax;
  if (mergedMin > mergedMax) {
    throw new ApiError(400, "VALIDATION_ERROR", "Den laveste pris må ikke være højere end den højeste.");
  }

  const patch: Record<string, unknown> = {};
  if (input.assessment !== undefined) patch.assessment = input.assessment;
  if (input.priceMin !== undefined) patch.price_min = input.priceMin;
  if (input.priceMax !== undefined) patch.price_max = input.priceMax;
  if (input.priceNote !== undefined) patch.price_note = input.priceNote || null;
  if (input.firstAvailableAt !== undefined) patch.first_available_at = input.firstAvailableAt ?? null;
  if (input.offer !== undefined) patch.offer = input.offer || null;
  if (input.validUntil !== undefined) patch.valid_until = input.validUntil ?? null;
  if (input.status !== undefined) patch.status = input.status;

  const updated = await updateResponse(supabase, responseId, patch);
  if (!updated) {
    // RLS afviste opdateringen, fordi tilstanden ændrede sig mellem læsning og skrivning.
    throw new ApiError(409, "STATE_CHANGED", "Svaret kunne ikke opdateres. Prøv igen.");
  }
  return toResponseDto(updated);
}

// Patienten (ejer) ser alle svar på sin forespørgsel. Tandlægen ser kun sit eget svar (RLS og filter her).
export async function listResponsesForSession(
  supabase: SupabaseClient,
  session: { userId: string; role: "patient" | "dentist" },
  requestId: string,
): Promise<ResponseDto[]> {
  if (session.role === "patient") {
    await requireOwnRequest(supabase, requestId, session.userId);
  } else {
    const request = await getRecipientRequestStatus(supabase, requestId);
    if (!request) throw notFound();
  }
  const records = await listResponsesForRequest(supabase, requestId);
  const own = session.role === "dentist" ? records.filter((r) => r.dentistId === session.userId) : records;
  return own.map(toResponseDto);
}

// Patienten vælger et svar (chosen) eller afviser det (declined). Ejerskab og tilstand kontrolleres i decide_response().
export async function decideOwnResponse(
  supabase: SupabaseClient,
  responseId: string,
  decision: "chosen" | "declined",
): Promise<ResponseDto> {
  await decideResponse(supabase, responseId, decision);
  const record = await getResponse(supabase, responseId);
  if (!record) throw notFound();
  return toResponseDto(record);
}
