import "server-only";
import type { ClinicSummaryDto } from "@/lib/types/clinics";
import type { Role } from "@/lib/types/common";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type ProfileRow = Pick<Tables<"profiles">, "role" | "is_anonymous" | "last_active_at">;

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

  // Brugerens egen klinik (kun id, navn og status til GET /api/me). RLS lader kun ejeren læse sin klinik.
  async findClinicSummary(userId: string): Promise<ClinicSummaryDto | null> {
    const row = await this.run<Pick<Tables<"clinics">, "id" | "name" | "status">>(
      this.db.from("clinics").select("id, name, status").eq("owner_id", userId).maybeSingle(),
      "clinics: select fejlede",
    );
    return row ? { id: row.id, name: row.name, status: row.status } : null;
  }

  // Forhåndstjek ved klinik-signup (architecture 4.3, 5.3): true, hvis en klinik med CVR'et allerede har en ejer.
  // GoTrue skjuler fejlen fra signup-triggeren, så controlleren svarer selv 409 CLINIC_EXISTS.
  async isCvrClaimed(cvr: string): Promise<boolean> {
    return (await this.rpc<boolean>("is_cvr_claimed", { p_cvr: cvr })) === true;
  }
}
