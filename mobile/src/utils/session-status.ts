import type { MeDto } from "@/lib/identity/types/auth";

// Appens ene sandhed om, hvem patienten er. Alle skærme læser denne status i stedet for selv at tolke `me`.
//   loading     = tokens og /api/me er ikke læst endnu
//   none        = ingen session (logget ud)
//   anonymous   = anonym session (kladde uden konto)
//   account     = patient med konto
//   unavailable = der er tokens, men serveren kunne ikke svare lige nu (kan prøves igen)
export type SessionStatus = "loading" | "none" | "anonymous" | "account" | "unavailable";

export function deriveSessionStatus(input: { ready: boolean; hasTokens: boolean; me: MeDto | null; retryable: boolean }): SessionStatus {
  if (!input.ready) return "loading";
  if (input.retryable) return "unavailable";
  if (!input.hasTokens || input.me === null) return "none";
  return input.me.isAnonymous ? "anonymous" : "account";
}

// Tekst til "Du er logget ind som …".
export function signedInLabel(me: Pick<MeDto, "displayName">): string {
  return me.displayName ?? "din konto";
}
