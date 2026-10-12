import "server-only";
import { BaseRepository } from "@/models/base/baseRepository";

// Tælleren ligger i tabellen rate_limits og opdateres atomisk af consume_rate_limit() i databasen.
// Begrundelse: serverless-funktioner deler ikke hukommelse, så en in-memory limiter ville ikke virke i drift.
// Kræver admin-klienten (architecture 2.3 b); klienten gives udefra.
export class RateLimitRepository extends BaseRepository {
  // Returnerer false, når grænsen er nået.
  async consume(key: string, limit: number): Promise<boolean> {
    return (await this.rpc<boolean>("consume_rate_limit", { p_key: key, p_limit: limit })) === true;
  }
}
