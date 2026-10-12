import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, notFound } from "@/middleware/http";
import { mapDbError } from "@/models/db/errors";

// Svaret fra supabase-js. Rækkernes form kendes ikke af klienten, så repositoriet angiver den (T) pr. kald.
type DbResult = { data: unknown; error: { message: string } | null };
export type KnownDbErrors = Record<string, ApiError>;

// Fælles grundlag for alle repositories (architecture 2.1.1). Klienten gives i constructoren og ejes af
// den, der opretter repositoriet (typisk en controller pr. request). Klassen holder ingen anden tilstand.
//
// TRow er rækken, som den kommer fra databasen (snake_case). TDto er det, repositoriet returnerer (camelCase).
export abstract class BaseRepository<TRow = unknown, TDto = TRow> {
  constructor(protected readonly db: SupabaseClient) {}

  // Række -> DTO. Repositories med en rækkeform overskriver den; standarden returnerer rækken uændret.
  protected toDto(row: TRow): TDto {
    return row as unknown as TDto;
  }

  protected toDtos(rows: readonly TRow[] | null | undefined): TDto[] {
    return (rows ?? []).map((row) => this.toDto(row));
  }

  // Afvikler en forespørgsel (select/insert/update/delete) og oversætter databasefejl til ApiError via mapDbError.
  // Ukendte fejl bliver til en almindelig Error (500 uden detaljer); `fallback` er den interne besked.
  protected async run<T>(query: PromiseLike<DbResult>, fallback: string, known: KnownDbErrors = {}): Promise<T | null> {
    const { data, error } = await query;
    mapDbError(error, known, fallback);
    return (data ?? null) as T | null;
  }

  // Som run, men en tom liste i stedet for null.
  protected async runList<T>(query: PromiseLike<DbResult>, fallback: string, known: KnownDbErrors = {}): Promise<T[]> {
    return (await this.run(query, fallback, known)) ?? [];
  }

  // Kalder en database-funktion (RPC). Navngivne kald pr. funktion hører til i de konkrete repositories.
  protected async rpc<T>(
    name: string,
    args: Record<string, unknown> | undefined,
    known: KnownDbErrors = {},
  ): Promise<T | null> {
    return this.run<T>(this.db.rpc(name, args), `${name} fejlede`, known);
  }

  // Find eller kast: 404 som standard (vi skelner ikke mellem "findes ikke" og "ingen adgang", architecture 2.4),
  // eller den fejl, kalderen angiver (fx 403, hvor 2.4 tillader det). `require…`-metoder bygges på denne.
  protected requireRow<T>(
    row: T | null | undefined,
    errors: { notFound?: ApiError; forbidden?: ApiError } = {},
  ): T {
    if (row === null || row === undefined) {
      throw errors.forbidden ?? errors.notFound ?? notFound();
    }
    return row;
  }
}
