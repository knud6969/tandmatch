import type { z } from "zod";
import type { convertSchema, loginSchema, signupSchema } from "@/lib/schemas/auth";
import type { AuthResultDto } from "@/lib/types/auth";
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
