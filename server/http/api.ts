import "server-only";
import type { ZodType } from "zod";

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

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorResponse(error: ApiError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

// Pakker en route-handler, så ApiError bliver til korrekt statuskode og alle andre fejl til 500 uden detaljer.
export function withApi(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
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
