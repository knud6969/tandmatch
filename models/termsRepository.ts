import "server-only";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import type { TermsPayload } from "@/middleware/termsCookie";
import { BaseRepository } from "@/models/base/baseRepository";

// Vilkårs-accept i terms_acceptances via brugerens JWT (RLS: user_id = auth.uid()).
export class TermsRepository extends BaseRepository {
  // Dubletter ignoreres, så samme version kun findes én gang pr. bruger.
  async upsertAcceptance(userId: string, payload: TermsPayload): Promise<void> {
    await this.run(
      this.db.from("terms_acceptances").upsert(
        {
          user_id: userId,
          terms_version: payload.termsVersion,
          privacy_version: payload.privacyVersion,
          accepted_at: payload.acceptedAt,
        },
        { onConflict: "user_id,terms_version,privacy_version", ignoreDuplicates: true },
      ),
      "terms_acceptances: upsert fejlede",
    );
  }

  async hasCurrentAcceptance(userId: string): Promise<boolean> {
    const data = await this.run(
      this.db
        .from("terms_acceptances")
        .select("id")
        .eq("user_id", userId)
        .eq("terms_version", TERMS_VERSION)
        .eq("privacy_version", PRIVACY_VERSION)
        .maybeSingle(),
      "terms_acceptances: select fejlede",
    );
    return data !== null;
  }
}
