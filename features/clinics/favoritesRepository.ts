import "server-only";
import type { FavoriteExportDto } from "@/lib/clinics/types/favorites";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";
import { favoriteLimit, notFound } from "@/platform/middleware/http";

type FavoriteRow = Pick<Tables<"favorite_clinics">, "clinic_id" | "created_at">;

// Patientens gemte klinikker (clinics 4.3 `favorite_clinics`). Brugerens JWT: RLS giver kun egne rækker, og INSERT-policyen
// afviser klinikker, der ikke vises offentligt (is_public_clinic), og anonyme konti. Klinikken kan aldrig læse tabellen.
export class FavoritesRepository extends BaseRepository<FavoriteRow, FavoriteExportDto> {
  protected toDto(row: FavoriteRow): FavoriteExportDto {
    return { clinicId: row.clinic_id, createdAt: row.created_at };
  }

  // Egne favoritter, ældste først (højst 200 pr. patient).
  async listOwn(): Promise<FavoriteExportDto[]> {
    return this.toDtos(
      await this.runList<FavoriteRow>(this.db.from("favorite_clinics").select("clinic_id, created_at").order("created_at"), "favorite_clinics: select fejlede"),
    );
  }

  // Idempotent: en allerede gemt klinik giver ingen fejl. Politikken afviser usynlige klinikker (404); loftet giver 429.
  async add(patientId: string, clinicId: string): Promise<void> {
    await this.run(
      this.db.from("favorite_clinics").upsert({ patient_id: patientId, clinic_id: clinicId }, { onConflict: "patient_id,clinic_id", ignoreDuplicates: true }),
      "favorite_clinics: insert fejlede",
      { FAVORITE_LIMIT: favoriteLimit(), "row-level security": notFound(), "violates foreign key": notFound() },
    );
  }

  // Idempotent; sletter kun egne rækker (RLS).
  async remove(clinicId: string): Promise<void> {
    await this.run(this.db.from("favorite_clinics").delete().eq("clinic_id", clinicId), "favorite_clinics: delete fejlede");
  }
}
