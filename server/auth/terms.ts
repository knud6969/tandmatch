import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { AUTH_COOKIE_OPTIONS } from "@/server/db/config";
import { hasCurrentTermsAcceptance, upsertTermsAcceptance } from "@/server/models/terms";
import {
  TERMS_COOKIE,
  TERMS_COOKIE_MAX_AGE_SECONDS,
  signTermsPayload,
  verifyCurrentTermsCookie,
  type TermsPayload,
} from "@/server/auth/terms-cookie";
import { ApiError } from "@/server/http/api";

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
export type TermsGate =
  | { userId: null; terms: TermsPayload }
  | { userId: string; terms: TermsPayload | null };

// Kræver gyldig vilkårs-accept (architecture 2.5, 10.2).
// Uden session: gyldig signeret cookie kræves.
// Med session: accept i terms_acceptances for aktuelle versioner, ellers overføres cookie-accepten (indsættes).
export async function requireTerms(): Promise<TermsGate> {
  const terms = await readCurrentTermsCookie();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!terms) {
      throw termsRequiredError();
    }
    return { userId: null, terms };
  }

  const hasRow = await hasCurrentTermsAcceptance(supabase, user.id);
  if (!hasRow) {
    if (!terms) {
      throw termsRequiredError();
    }
    await upsertTermsAcceptance(supabase, user.id, terms);
  }
  return { userId: user.id, terms };
}

export function termsRequiredError(): ApiError {
  return new ApiError(
    403,
    "TERMS_REQUIRED",
    "Du skal acceptere brugervilkårene og privatlivspolitikken først.",
  );
}
