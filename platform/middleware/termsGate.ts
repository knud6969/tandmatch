import "server-only";
import { cookies, headers } from "next/headers";
import { TERMS_TOKEN_HEADER } from "@/lib/identity/constants/sessions";
import { createAuthContext, type AuthContext } from "@/platform/middleware/session";
import { AUTH_COOKIE_OPTIONS } from "@/platform/db/config";
import { isTokenTransport } from "@/platform/db/supabase";
import { TermsRepository } from "@/features/identity/termsRepository";
import {
  TERMS_COOKIE,
  TERMS_COOKIE_MAX_AGE_SECONDS,
  signTermsPayload,
  verifyCurrentTermsCookie,
  type TermsPayload,
} from "@/platform/middleware/termsCookie";
import { ApiError } from "@/platform/middleware/http";

// Den aktuelle vilkårs-accept: fra headeren X-Terms-Token (appen) eller cookien tm_terms (browseren), begge signeret med
// samme HMAC og verificeret ens. Kommer requesten fra appen (Authorization eller X-TandMatch-Client), læses cookies
// ikke, så de to veje ikke kan blandes (architecture 2.5 punkt 3).
export async function readCurrentTerms(): Promise<TermsPayload | null> {
  const h = await headers();
  const headerValue = h.get(TERMS_TOKEN_HEADER)?.trim() || undefined;
  if (isTokenTransport(h)) return verifyCurrentTermsCookie(headerValue);
  const store = await cookies();
  return (await verifyCurrentTermsCookie(store.get(TERMS_COOKIE)?.value)) ?? (await verifyCurrentTermsCookie(headerValue));
}

// Kaldes fra /api/terms/accept efter at accepten er skrevet til databasen (hvis der er en session).
export async function setTermsCookie(payload: TermsPayload): Promise<void> {
  const value = await signTermsPayload(payload);
  const store = await cookies();
  store.set(TERMS_COOKIE, value, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: TERMS_COOKIE_MAX_AGE_SECONDS,
  });
}

// Uden session er en gyldig cookie garanteret (terms er ikke null). Med session kan den mangle,
// hvis accepten allerede ligger i terms_acceptances.
// `supabase` er requestens ene klient (middleware/session.ts, AuthContext): routen giver den videre til
// requireRole() og controlleren.
export type TermsGate = Pick<AuthContext, "supabase" | "transport" | "accessToken"> & (
  | { userId: null; terms: TermsPayload }
  | { userId: string; terms: TermsPayload | null }
);

// Kræver gyldig vilkårs-accept (architecture 2.5, 10.2).
// Uden session: gyldig signeret cookie kræves.
// Med session: accept i terms_acceptances for aktuelle versioner, ellers overføres cookie-accepten (indsættes).
export async function requireTerms(): Promise<TermsGate> {
  const terms = await readCurrentTerms();
  const { supabase, userId, transport, accessToken } = await createAuthContext();

  if (!userId) {
    if (!terms) {
      throw termsRequiredError();
    }
    return { supabase, transport, accessToken, userId: null, terms };
  }

  const termsRepo = new TermsRepository(supabase);
  const hasRow = await termsRepo.hasCurrentAcceptance(userId);
  if (!hasRow) {
    if (!terms) {
      throw termsRequiredError();
    }
    await termsRepo.upsertAcceptance(userId, terms);
  }
  return { supabase, transport, accessToken, userId, terms };
}

function termsRequiredError(): ApiError {
  return new ApiError(
    403,
    "TERMS_REQUIRED",
    "Du skal acceptere brugervilkårene og privatlivspolitikken først.",
  );
}
