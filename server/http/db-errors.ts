import "server-only";
import { ApiError } from "@/server/http/api";

type DbError = { message: string } | null;

// Oversætter fejlkoder fra databasen (raise exception i triggers og funktioner) til API-fejl.
// Ukendte fejl kastes som almindelige fejl og bliver til 500 uden detaljer.
export function mapDbError(error: DbError, known: Record<string, ApiError>, fallback: string): never {
  if (error) {
    for (const [code, apiError] of Object.entries(known)) {
      if (error.message.includes(code)) {
        throw apiError;
      }
    }
  }
  throw new Error(fallback);
}
