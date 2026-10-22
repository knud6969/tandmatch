import "server-only";

// Fejl fra Supabase Auth, der skyldes tjenesten og ikke brugeren: netværksfejl (status 0), AuthRetryableFetchError og 5xx.
// De betyder ikke, at brugeren er logget ud, og må aldrig behandles som "ingen session" (401, redirect til login).
export function isTransientAuthError(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status !== undefined && error.status >= 500);
}
