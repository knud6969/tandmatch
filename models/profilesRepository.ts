import "server-only";
import type { Role } from "@/lib/types/common";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type ProfileRow = Pick<Tables<"profiles">, "role" | "is_anonymous" | "last_active_at">;

type ProfileDto = {
  role: Role;
  isAnonymous: boolean;
  lastActiveAt: string;
};

export class ProfilesRepository extends BaseRepository<ProfileRow, ProfileDto> {
  protected toDto(row: ProfileRow): ProfileDto {
    return { role: row.role, isAnonymous: row.is_anonymous, lastActiveAt: row.last_active_at };
  }

  async findById(userId: string): Promise<ProfileDto | null> {
    const row = await this.run(
      this.db.from("profiles").select("role, is_anonymous, last_active_at").eq("id", userId).maybeSingle(),
      "profiles: select fejlede",
    );
    return row ? this.toDto(row) : null;
  }

  // Opdaterer last_active_at for den indloggede anonyme bruger (architecture 7.7).
  async touchLastActive(): Promise<void> {
    await this.rpc("touch_last_active", undefined);
  }
}
