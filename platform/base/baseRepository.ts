import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, notFound } from "@/platform/middleware/http";
import { mapDbError } from "@/platform/db/errors";

// Svaret fra supabase-js. Klienten er utypet, så rækkernes form angives af repositoriet (TRow, fra
// platform/db/database.types.ts) og stoles på uden runtime-validering (architecture 2.1.1).
type DbResult = { data: unknown; error: { message: string } | null };
type KnownDbErrors = Record<string, ApiError>;

// Fejl, som alle database-funktioner kan kaste (raise exception 'INVALID_INPUT').
const COMMON_RPC_ERRORS = (): KnownDbErrors => ({
  INVALID_INPUT: new ApiError(400, "VALIDATION_ERROR", "Oplysningerne er ugyldige."),
});

// Fælles grundlag for alle repositories (architecture 2.1.1). Klienten gives i constructoren og ejes af
// den, der opretter repositoriet (typisk en controller pr. request). Klassen holder ingen anden tilstand.
//
// TRow er rækken, som den kommer fra databasen (snake_case, typen genereres af Supabase). TDto er det, repositoriet
// returnerer (camelCase). Repositories uden en bestemt række (rpc-only) lader TRow være `unknown`.
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
  protected async run<T = TRow>(query: PromiseLike<DbResult>, fallback: string, known: KnownDbErrors = {}): Promise<T | null> {
    const { data, error } = await query;
    mapDbError(error, known, fallback);
    return (data ?? null) as T | null;
  }

  // Som run, men en tom liste i stedet for null.
  protected async runList<T = TRow>(query: PromiseLike<DbResult>, fallback: string, known: KnownDbErrors = {}): Promise<T[]> {
    return (await this.run(query, fallback, known)) ?? [];
  }

  // Kalder en database-funktion (RPC). Navngivne kald pr. funktion hører til i de konkrete repositories.
  // Kendte fejl, der gælder for alle funktioner (INVALID_INPUT), oversættes her ét sted; `known` tilføjer de særlige.
  protected async rpc<T>(
    name: string,
    args: Record<string, unknown> | undefined,
    known: KnownDbErrors = {},
  ): Promise<T | null> {
    return this.run<T>(this.db.rpc(name, args), `${name} fejlede`, { ...COMMON_RPC_ERRORS(), ...known });
  }

  // Camel-case-patch -> kolonner: kun de felter, der er sat (`undefined` springes over). `map` navngiver kolonnen pr. felt.
  protected patchColumns<P extends object>(patch: P, map: { [K in keyof P]?: string }): Record<string, unknown> {
    const columns: Record<string, unknown> = {};
    for (const key of Object.keys(map) as (keyof P)[]) {
      const column = map[key];
      if (column !== undefined && patch[key] !== undefined) columns[column] = patch[key];
    }
    return columns;
  }

  // Opdaterer en række med en patch og returnerer den opdaterede række (find-eller-kast, 404 som standard).
  // En tom patch ændrer intet: den uændrede række hentes i stedet (architecture 10.8). Forespørgslerne bygges af kalderen,
  // så filtrene (fx klinik-id) ligger i repositoriet. `update` skal ende i `.select(...).maybeSingle()`.
  protected async patchRow<P extends object>(
    patch: P,
    map: { [K in keyof P]?: string },
    queries: {
      update: (columns: Record<string, unknown>) => PromiseLike<DbResult>;
      current: () => PromiseLike<DbResult>;
    },
    fallback: string,
    known: KnownDbErrors = {},
  ): Promise<TRow> {
    const columns = this.patchColumns(patch, map);
    const empty = Object.keys(columns).length === 0;
    const row = await this.run<TRow>(empty ? queries.current() : queries.update(columns), fallback, known);
    return this.requireRow(row);
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
