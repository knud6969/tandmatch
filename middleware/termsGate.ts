import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAuthContext } from "@/middleware/session";
import { AUTH_COOKIE_OPTIONS } from "@/models/db/config";
import { TermsRepository } from "@/models/termsRepository";
import {
  TERMS_COOKIE,
  TERMS_COOKIE_MAX_AGE_SECONDS,
  signTermsPayload,
  verifyCurrentTermsCookie,
  type TermsPayload,
} from "@/middleware/termsCookie";
import { ApiError } from "@/middleware/http";

export async function readCurrentTermsCookie(): Promise<TermsPayload | null> {
  const store = await cookies();
  return verifyCurrentTermsCookie(store.get(TERMS_COOKIE)?.value);
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
export type TermsGate = { supabase: SupabaseClient } & (
  | { userId: null; terms: TermsPayload }
  | { userId: string; terms: TermsPayload | null }
);

// Kræver gyldig vilkårs-accept (architecture 2.5, 10.2).
// Uden session: gyldig signeret cookie kræves.
// Med session: accept i terms_acceptances for aktuelle versioner, ellers overføres cookie-accepten (indsættes).
export async function requireTerms(): Promise<TermsGate> {
  const terms = await readCurrentTermsCookie();
  const { supabase, userId } = await createAuthContext();

  if (!userId) {
    if (!terms) {
      throw termsRequiredError();
    }
    return { supabase, userId: null, terms };
  }

  const termsRepo = new TermsRepository(supabase);
  const hasRow = await termsRepo.hasCurrentAcceptance(userId);
  if (!hasRow) {
    if (!terms) {
      throw termsRequiredError();
    }
    await termsRepo.upsertAcceptance(userId, terms);
  }
  return { supabase, userId, terms };
}

export function termsRequiredError(): ApiError {
  return new ApiError(
    403,
    "TERMS_REQUIRED",
    "Du skal acceptere brugervilkårene og privatlivspolitikken først.",
  );
}
