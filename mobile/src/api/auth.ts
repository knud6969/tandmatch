import type { z } from "zod";
import type { convertSchema, loginSchema, signupSchema } from "@/lib/schemas/auth";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { AuthResultDto } from "@/lib/types/auth";
import type { AnonymousSessionDto } from "@/lib/types/session";
import { clearSession, saveSession } from "~/auth/tokens";
import { ApiRequestError, apiRequest } from "./client";

type LoginInput = z.infer<typeof loginSchema>;
type SignupInput = Extract<z.infer<typeof signupSchema>, { role: "patient" }>;
type ConvertInput = z.infer<typeof convertSchema>;

export type LoginOutcome = "ok" | "not_patient";

async function storeSession(result: AuthResultDto): Promise<void> {
  if (!result.session) throw new ApiRequestError(500, "INTERNAL", "");
  await saveSession(result.session);
}

// Login. En klinik-konto gemmes aldrig i appen: klinikker bruger weben (architecture 13.3).
export async function login(input: LoginInput): Promise<LoginOutcome> {
  const result = await apiRequest<AuthResultDto>("/api/auth/login", { method: "POST", json: input });
  if (result.role !== "patient") return "not_patient";
  await storeSession(result);
  return "ok";
}

export async function signupPatient(input: SignupInput): Promise<void> {
  await storeSession(await apiRequest<AuthResultDto>("/api/auth/signup", { method: "POST", json: input }));
}

// En anonym session (kladde) gøres til en konto; nye tokens gemmes.
export async function convertAnonymous(input: ConvertInput): Promise<void> {
  await storeSession(await apiRequest<AuthResultDto>("/api/auth/convert", { method: "POST", json: input }));
}

// Log ud: kaldet tilbagekalder tokenet på serveren; tokens slettes lokalt, også hvis kaldet fejler (architecture 13.3).
export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    await clearSession();
  }
}

// Anonym start (architecture 10.2): opretter session, AI-samtykke og tom sag. 201 giver tokens, som gemmes; 200 (retry med en
// eksisterende anonym session) giver kun den eksisterende kladde.
export async function startAnonymousSession(): Promise<AnonymousSessionDto> {
  const result = await apiRequest<AnonymousSessionDto>("/api/session/anonymous", {
    method: "POST",
    json: { aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } },
  });
  if (result.session) await saveSession(result.session);
  return result;
}
