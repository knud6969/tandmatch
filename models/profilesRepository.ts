import "server-only";
import { z } from "zod";
import type { Role } from "@/lib/types/common";
import { BaseRepository } from "@/models/base/baseRepository";

const profileRowSchema = z.object({
  role: z.enum(["patient", "clinic", "admin"]),
  is_anonymous: z.boolean(),
  last_active_at: z.string(),
});

type ProfileRow = z.infer<typeof profileRowSchema>;

export type ProfileDto = {
  role: Role;
  isAnonymous: boolean;
  lastActiveAt: string;
};

export class ProfilesRepository extends BaseRepository<ProfileRow, ProfileDto> {
  protected toDto(row: ProfileRow): ProfileDto {
    return { role: row.role, isAnonymous: row.is_anonymous, lastActiveAt: row.last_active_at };
  }

  async findById(userId: string): Promise<ProfileDto | null> {
    const data = await this.run(
      this.db.from("profiles").select("role, is_anonymous, last_active_at").eq("id", userId).maybeSingle(),
      "profiles: select fejlede",
    );
    if (!data) return null;
    const parsed = profileRowSchema.safeParse(data);
    if (!parsed.success) throw new Error("profiles: uventet format");
    return this.toDto(parsed.data);
  }

  // Opdaterer last_active_at for den indloggede anonyme bruger (architecture 7.7).
  async touchLastActive(): Promise<void> {
    await this.rpc("touch_last_active", undefined);
  }
}
