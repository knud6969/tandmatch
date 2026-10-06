import type { MeDto } from "@/lib/types/auth";

// Klientens eneste adgang til backend: fetch mod /api/* (architecture 2.1). Ingen Supabase i browseren.
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  // Til multipart/form-data (billedupload). Content-Type sættes af browseren.
  form?: FormData;
};

function readApiErrorBody(data: unknown): { code: string; message: string } | null {
  if (typeof data !== "object" || data === null || !("error" in data)) return null;
  const error = (data as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return null;
  return { code, message };
}

// Returnerer undefined ved 204 No Content. Kaster ApiRequestError ved fejl (status 0 = netværksfejl).
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: options.form ?? (hasBody ? JSON.stringify(options.body) : undefined),
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK",
      "Vi kunne ikke oprette forbindelse. Tjek din internetforbindelse og prøv igen.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiErrorBody(data);
    throw new ApiRequestError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? "Der opstod en fejl. Prøv igen om lidt.",
    );
  }
  return data as T;
}

// Ingen session (401) eller ingen gyldig vilkårs-accept (403) betyder "ikke logget ind" for UI'et.
export async function getMe(): Promise<MeDto | null> {
  try {
    return await apiRequest<MeDto>("/api/me");
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}
