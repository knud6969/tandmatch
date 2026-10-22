import "server-only";
import type { ZodType } from "zod";
import {
  ALREADY_REPLIED_TEXT,
  ALREADY_REVIEWED_TEXT,
  BOOKING_LIMIT_TEXT,
  BOOKING_NOT_CANCELLABLE_TEXT,
  CLINIC_NOT_VERIFIED_TEXT,
  LEAD_NOT_ACCEPTED_TEXT,
  MESSAGE_LIMIT_TEXT,
  NO_SHOW_WINDOW_CLOSED_TEXT,
  REVIEW_NOT_ALLOWED_TEXT,
  SLOT_TAKEN_TEXT,
  SLOT_UNAVAILABLE_TEXT,
  THREAD_CLOSED_TEXT,
} from "@/lib/common/constants/error-texts";

// Fælles fejlformat (architecture 2.4). Meddelelser er på dansk og uden interne detaljer.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_BODY_CHARS = 10_000;

// Svar med tokens må aldrig caches af proxyer eller klienten.
export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

function errorResponse(error: ApiError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

// Pakker en route-handler, så ApiError bliver til korrekt statuskode og alle andre fejl til 500 uden detaljer.
export function withApi<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err);
      }
      // Logger kun fejltypen, aldrig request-indhold, nøgler eller persondata.
      console.error("API-fejl:", err instanceof Error ? err.name : "ukendt");
      return errorResponse(
        new ApiError(500, "INTERNAL", "Der opstod en fejl. Prøv igen om lidt."),
      );
    }
  };
}

// Læser og validerer JSON-body med zod. Afviser for store bodies og ukendte felter (strict-skemaer).
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Indholdet er for stort.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Indholdet kunne ikke læses.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      first ?? "Ugyldige oplysninger. Tjek felterne og prøv igen.",
    );
  }
  return parsed.data;
}

// Læser og validerer query-parametre med zod. Manglende parametre sendes som undefined.
export function readQuery<T>(req: Request, schema: ZodType<T>, keys: readonly string[]): T {
  const params = new URL(req.url).searchParams;
  const raw = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Ugyldig forespørgsel.");
  }
  return parsed.data;
}

// Afviser et for stort billede ud fra Content-Length, før noget læses. En request uden gyldig Content-Length (fx chunked
// transfer) afvises også med 411, fordi størrelsen så ikke kan tjekkes, før bodyen er læst ind i hukommelsen (M2).
export function rejectLargeImage(req: Request, maxBytes: number): void {
  const header = req.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header.trim())) {
    throw new ApiError(411, "LENGTH_REQUIRED", "Billedets størrelse mangler. Prøv at uploade igen.");
  }
  if (Number(header) > maxBytes + 64 * 1024) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Billedet er for stort. Max 4 MB.");
  }
}

// Returnerer en funktion, der læser ét billede fra en multipart-body. Controlleren kalder den først efter sine
// tjek (fx samtykke), så helbredsdata ikke læses ind før det er tilladt (architecture 9.3).
export function imageFileReader(req: Request, field: string, maxBytes: number): () => Promise<File> {
  return async () => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "INVALID_FORM", "Billedet kunne ikke læses.");
    }
    const file = form.get(field);
    if (!(file instanceof File)) {
      throw new ApiError(400, "MISSING_FILE", "Vedhæft et billede.");
    }
    if (file.size > maxBytes) {
      throw new ApiError(413, "FILE_TOO_LARGE", "Billedet er for stort. Max 4 MB.");
    }
    return file;
  };
}

// Læser en multipart-body med ét billede og tekstfelter (fx porteføljebillede, architecture 10.8). Felterne valideres
// med zod, før noget behandles; manglende bekræftelse giver dermed 400, før billedet røres.
export async function readImageForm<T>(
  req: Request,
  fileField: string,
  maxBytes: number,
  fieldsSchema: ZodType<T>,
): Promise<{ file: File; fields: T }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "INVALID_FORM", "Billedet kunne ikke læses.");
  }
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key !== fileField && typeof value === "string") raw[key] = value;
  }
  const parsed = fieldsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Ugyldige oplysninger. Tjek felterne og prøv igen.",
    );
  }
  const file = form.get(fileField);
  if (!(file instanceof File)) {
    throw new ApiError(400, "MISSING_FILE", "Vedhæft et billede.");
  }
  if (file.size > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Billedet er for stort. Max 4 MB.");
  }
  return { file, fields: parsed.data };
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Ugyldigt id og manglende id giver 404 (architecture 2.4: vi skelner ikke, for ikke at lække eksistens).
export function parseId(value: string): string {
  if (!UUID_RE.test(value)) {
    throw notFound();
  }
  return value;
}

// Fælles fejl (architecture 2.4). Brug disse i stedet for at bygge ApiError med samme tekst igen.
export const notFound = () => new ApiError(404, "NOT_FOUND", "Fandt ikke det ønskede.");

export const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Du skal være logget ind.");

// Rollen eller handlingen er ikke tilladt for den indloggede.
export const forbidden = () => new ApiError(403, "FORBIDDEN", "Du har ikke adgang til denne handling.");

export const anonymousNotAllowed = () =>
  new ApiError(403, "ANONYMOUS_NOT_ALLOWED", "Opret en konto for at fortsætte.");

// Konflikt med tilstanden (409). Alle 409-fejl bygges her, så formen er den samme overalt.
export const conflict = (code: string, message: string) => new ApiError(409, code, message);

// Sagen er ikke længere en kladde (architecture 10.5): kun kladder kan ændres.
export const notDraft = () => conflict("NOT_DRAFT", "Sagen er sendt og kan ikke ændres.");

// Handlingen kræver en konto. Teksten afhænger af handlingen og står kun her (routes, controllere og repositories bruger den).
export const ACCOUNT_REQUIRED_MESSAGES = {
  sendLeads: "Opret en konto for at kontakte klinikker.",
  withdrawLead: "Opret en konto for at trække en henvendelse tilbage.",
  bookSlot: "Opret en konto for at booke en tid.",
  emergencyLead: "Opret en konto for at bestille en akuttid.",
} as const;

export const accountRequired = (message: string) => new ApiError(403, "ACCOUNT_REQUIRED", message);

// Klinikken er ikke verificeret og kan hverken modtage eller besvare leads (architecture 3, 5.7, 10.9).
export const clinicNotVerified = () =>
  new ApiError(403, "CLINIC_NOT_VERIFIED", CLINIC_NOT_VERIFIED_TEXT);

// Beskedtråden er lukket (lead afvist eller trukket tilbage, architecture 10.12).
export const threadClosed = () =>
  new ApiError(409, "THREAD_CLOSED", THREAD_CLOSED_TEXT);

// Daglige loft for beskeder er nået (architecture 7.6).
export const messageLimit = () =>
  new ApiError(429, "MESSAGE_LIMIT", MESSAGE_LIMIT_TEXT);

export const consentRequired = (message: string) => new ApiError(403, "CONSENT_REQUIRED", message);

// AI-samtykket mangler til chatten. Teksten står kun her.
export const AI_CONSENT_REQUIRED_MESSAGE = "Du skal give samtykke til AI-behandling, før du kan chatte.";
export const aiConsentRequired = () => consentRequired(AI_CONSENT_REQUIRED_MESSAGE);

// Samtalen er lukket eller har nået grænsen for antal beskeder (architecture 7.6).
export const chatLimit = () => new ApiError(429, "CHAT_LIMIT", "Samtalen er lukket eller har nået grænsen for antal beskeder.");

// AI-tjenesten svarer ikke eller gav et ugyldigt svar (architecture 7.6: timeout og nedbrud giver 503).
export const aiUnavailable = () =>
  new ApiError(503, "AI_UNAVAILABLE", "AI-assistenten er ikke tilgængelig lige nu. Prøv igen om lidt.");

// Booking (architecture 10.10). Fabrikkerne bruges af både controllere og repositories.
export const leadNotAccepted = () =>
  conflict("LEAD_NOT_ACCEPTED", LEAD_NOT_ACCEPTED_TEXT);

export const clinicNotAvailable = () => conflict("CLINIC_NOT_AVAILABLE", "Klinikken kan ikke modtage bookinger lige nu.");

// Ydelsen er ikke en af sagens bekræftede ydelser.
export const serviceNotOnCase = () => new ApiError(400, "VALIDATION_ERROR", "Vælg en af behandlingerne på din sag.");

export const slotTaken = () => conflict("SLOT_TAKEN", SLOT_TAKEN_TEXT);

export const slotUnavailable = () => conflict("SLOT_UNAVAILABLE", SLOT_UNAVAILABLE_TEXT);

// Leadet har nået loftet på bookinger (architecture 7.6).
export const bookingLimit = () => conflict("BOOKING_LIMIT", BOOKING_LIMIT_TEXT);

export const bookingNotCancellable = () => conflict("BOOKING_NOT_CANCELLABLE", BOOKING_NOT_CANCELLABLE_TEXT);

export const noShowWindowClosed = () => conflict("NO_SHOW_WINDOW_CLOSED", NO_SHOW_WINDOW_CLOSED_TEXT);

// Anmeldelse (architecture 10.13).
export const reviewNotAllowed = () => new ApiError(403, "REVIEW_NOT_ALLOWED", REVIEW_NOT_ALLOWED_TEXT);

export const alreadyReviewed = () => conflict("ALREADY_REVIEWED", ALREADY_REVIEWED_TEXT);

export const alreadyReplied = () => conflict("ALREADY_REPLIED", ALREADY_REPLIED_TEXT);
