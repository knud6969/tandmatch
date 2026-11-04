import "server-only";
import type { PushDeviceExportDto } from "@/lib/identity/types/push-tokens";
import type { RegisterPushTokenInput } from "@/lib/identity/types/push-tokens";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";
import { forbidden, unauthenticated } from "@/platform/middleware/http";

type PushTokenRow = Pick<Tables<"push_tokens">, "platform" | "created_at" | "last_seen_at">;

// Patientens enheder til push (identity 4.3 `push_tokens`). Skrivning kun via register_push_token(); sletning og læsning
// kun af egne rækker (RLS). Tokens logges aldrig og sendes aldrig til klinikker.
export class PushTokensRepository extends BaseRepository<PushTokenRow, PushDeviceExportDto> {
  protected toDto(row: PushTokenRow): PushDeviceExportDto {
    return { platform: row.platform as PushDeviceExportDto["platform"], createdAt: row.created_at, lastSeenAt: row.last_seen_at };
  }

  async register(input: RegisterPushTokenInput): Promise<void> {
    await this.rpc("register_push_token", { p_token: input.token, p_platform: input.platform }, { FORBIDDEN: forbidden(), UNAUTHENTICATED: unauthenticated() });
  }

  // Sletter kun egne rækker (RLS); et fremmed eller ukendt token giver ingen fejl og ingen sletning.
  async remove(token: string): Promise<void> {
    await this.run(this.db.from("push_tokens").delete().eq("token", token), "push_tokens: delete fejlede");
  }

  // Til dataeksporten: uden selve tokenet.
  async listOwnForExport(): Promise<PushDeviceExportDto[]> {
    return this.toDtos(
      await this.runList<PushTokenRow>(
        this.db.from("push_tokens").select("platform, created_at, last_seen_at").order("created_at"),
        "push_tokens: select fejlede",
      ),
    );
  }
}
