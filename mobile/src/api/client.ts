import { apiErrorText } from "@/lib/domain/errors";
import { MOBILE_CLIENT_HEADER, MOBILE_CLIENT_VALUE, TERMS_TOKEN_HEADER } from "@/lib/constants/sessions";
import type { MobileSessionDto } from "@/lib/types/auth";
import { clearSession, clearTermsToken, getSession, getTermsToken, notifyAuthChange, saveSession } from "~/auth/tokens";

// Eneste sted i appen med fetch (architecture 13.2-13.3).

// Fornyes adgangstokenet inden for så mange millisekunder, fornyes det før kaldet.
const REFRESH_MARGIN_MS = 60_000;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly serverMessage: string;
  // `message` er den danske tekst fra apiErrorText().
  constructor(status: number, code: string, serverMessage: string) {
    super(apiErrorText(code, serverMessage));
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
};

function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

async function readError(response: Response): Promise<ApiRequestError> {
  let code = "UNKNOWN";
  let message = "";
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? "";
  } catch {
    // Intet JSON-svar; koden forbliver UNKNOWN.
  }
  return new ApiRequestError(response.status, code, message);
}

async function send(path: string, options: ApiRequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { [MOBILE_CLIENT_HEADER]: MOBILE_CLIENT_VALUE, Accept: "application/json" };
  const termsToken = await getTermsToken();
  if (termsToken) headers[TERMS_TOKEN_HEADER] = termsToken;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: string | FormData | undefined;
  if (options.formData) {
    body = options.formData; // Content-Type med boundary sættes af fetch.
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }
  try {
    return await fetch(`${baseUrl()}${path}`, { method: options.method ?? "GET", headers, body });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "");
  }
}

// Fornyelse: ét fælles løfte, fordi Supabase roterer refresh-tokens, og et genbrugt token afvises (architecture 13.3).
let refreshing: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(): Promise<void> {
  const stored = await getSession();
  if (!stored) throw new ApiRequestError(401, "UNAUTHENTICATED", "");
  const response = await send("/api/auth/refresh", { method: "POST", json: { refreshToken: stored.refreshToken } }, null);
  if (response.ok) {
    const body = (await response.json()) as { session: MobileSessionDto };
    await saveSession(body.session);
    return;
  }
  const error = await readError(response);
  // 503 AUTH_UNAVAILABLE og netværksfejl er ikke "logget ud": tokens beholdes, og brugeren kan prøve igen.
  if (response.status === 401) await clearSession();
  throw error;
}

export async function apiRequest<T = void>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let session = await getSession();
  if (session && session.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    await refreshSession();
    session = await getSession();
  }
  const sentToken = session?.accessToken ?? null;
  let response = await send(path, options, sentToken);

  if (response.status === 401 && sentToken) {
    const error = await readError(response);
    if (error.code !== "UNAUTHENTICATED") throw error;
    // Har en samtidig request allerede fornyet, bruges det nye token uden endnu et refresh-kald.
    const current = await getSession();
    if (!current || current.accessToken === sentToken) await refreshSession();
    const renewed = await getSession();
    response = await send(path, options, renewed?.accessToken ?? null);
  }

  if (!response.ok) {
    const error = await readError(response);
    if (error.status === 403 && error.code === "TERMS_REQUIRED") {
      await clearTermsToken();
      notifyAuthChange();
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
