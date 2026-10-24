import type { z } from "zod";
import type { convertSchema, loginSchema, signupSchema } from "@/lib/identity/schemas/auth";
import { CONSENT_TEXT_VERSIONS } from "@/lib/identity/constants/consents";
import type { AuthResultDto } from "@/lib/identity/types/auth";
import type { AnonymousSessionDto, ClaimResultDto, ClaimTokenDto } from "@/lib/identity/types/session";
import { clearSession, saveSession } from "~/auth/tokens";
import { ApiRequestError, apiRequest } from "./client";

// Typerne følger serverens skemaer, så appen og weben validerer ens (architecture 13.2).
type LoginInput = z.infer<typeof loginSchema>;
type SignupInput = Extract<z.infer<typeof signupSchema>, { role: "patient" }>;
type ConvertInput = z.infer<typeof convertSchema>;

export type LoginOutcome = "ok" | "not_patient";

// Tokens gemmes og SessionProvider opdateres, før kaldet returnerer (atomisk: ingen skærm ser halvt opdateret tilstand).
// Serveren giver kun tokens til mobilklienter; mangler de, er det en serverfejl.
async function storeSession(result: AuthResultDto): Promise<void> {
  if (!result.session) throw new ApiRequestError(500, "INTERNAL", "");
  await saveSession(result.session, { settle: true });
}

// Login. En klinik-konto gemmes aldrig i appen: klinikker bruger weben (architecture 13.3).
export async function login(input: LoginInput): Promise<LoginOutcome> {
  const result = await apiRequest<AuthResultDto>("/api/auth/login", { method: "POST", json: input });
  if (result.role !== "patient") return "not_patient";
  await storeSession(result);
  return "ok";
}

// Opretter en patientkonto og logger ind.
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
    await clearSession({ settle: true });
  }
}

// Anonym start (architecture 10.2): opretter session, AI-samtykke og tom sag. 201 giver tokens, som gemmes; 200 (retry med en
// eksisterende anonym session) giver kun den eksisterende kladde.
export async function startAnonymousSession(): Promise<AnonymousSessionDto> {
  const result = await apiRequest<AnonymousSessionDto>("/api/session/anonymous", {
    method: "POST",
    json: { aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } },
  });
  if (result.session) await saveSession(result.session, { settle: true });
  return result;
}

// Hvad der skete med kladden ved login: "moved" (flyttet til kontoen), "empty" (ingen kladde med indhold), "lost" (kunne ikke
// flyttes; patienten er logget ind uden den) eller "none" (patienten var ikke anonym).
export type DraftOutcome = "moved" | "empty" | "lost" | "none";
export type LoginWithDraftResult = { outcome: LoginOutcome; draft: DraftOutcome; caseId: string | null; draftError: string | null };

const CLAIM_ATTEMPTS = 3;

// Indløser engangs-tokenet med de nye tokens. Netværksfejl prøves igen med samme token (kaldet er idempotent); en anden fejl
// (fx 400 CLAIM_INVALID) giver "lost" med den danske tekst, fordi patienten da allerede er logget ind.
async function claimDraft(claimToken: string): Promise<Pick<LoginWithDraftResult, "draft" | "caseId" | "draftError">> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    try {
      const result = await apiRequest<ClaimResultDto>("/api/session/claim", { method: "POST", json: { claimToken } });
      return result.moved && result.caseId ? { draft: "moved", caseId: result.caseId, draftError: null } : { draft: "empty", caseId: null, draftError: null };
    } catch (e) {
      lastError = e;
      if (!(e instanceof ApiRequestError && e.code === "NETWORK")) break;
    }
  }
  const draftError = lastError instanceof ApiRequestError ? lastError.message : "Din tidligere samtale kunne ikke hentes over på kontoen.";
  return { draft: "lost", caseId: null, draftError };
}

// Login, der aldrig mister den anonyme kladde (architecture 10.2, identity 10.2). For en anonym patient, i denne rækkefølge:
// (a) claim-token, mens det anonyme token stadig gælder (kun i hukommelsen), (b) login, (c) claim med de nye tokens.
// Fejler (a) eller (b), ændres intet og fejlen kastes; den anonyme session består.
export async function loginKeepingDraft(input: LoginInput, options: { anonymous: boolean }): Promise<LoginWithDraftResult> {
  if (!options.anonymous) return { outcome: await login(input), draft: "none", caseId: null, draftError: null };

  let claimToken: string | null = null;
  try {
    claimToken = (await apiRequest<ClaimTokenDto>("/api/session/claim-token", { method: "POST" })).claimToken;
  } catch (e) {
    // Ikke længere anonym eller ingen session: der er ingen kladde at tage med, så almindeligt login.
    const notAnonymous = e instanceof ApiRequestError && (e.status === 401 || e.code === "NOT_ANONYMOUS");
    if (!notAnonymous) throw e;
  }
  const outcome = await login(input);
  if (outcome !== "ok" || claimToken === null) return { outcome, draft: "none", caseId: null, draftError: null };
  return { outcome, ...(await claimDraft(claimToken)) };
}
