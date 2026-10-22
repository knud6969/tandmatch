import "server-only";
import type { z } from "zod";
import { MAX_DENTISTS_PER_CLINIC } from "@/lib/clinics/constants/clinics";
import type { createDentistSchema, patchDentistSchema } from "@/lib/clinics/schemas/clinics";
import type { DentistRecordDto } from "@/lib/clinics/types/clinics";
import { ApiError } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";
import { PublicMediaStorage } from "@/features/clinics/publicMediaStorage";

type NewDentist = z.infer<typeof createDentistSchema>;
type DentistPatch = z.infer<typeof patchDentistSchema>;

type DentistRow = Pick<Tables<"clinic_dentists">, "id" | "full_name" | "title" | "bio" | "photo_path" | "photo_updated_at" | "sort_order">;

const DENTIST_COLUMNS = "id, full_name, title, bio, photo_path, photo_updated_at, sort_order";

// Klinikkens tandlæger (architecture 4.3 `clinic_dentists`): kun visning, intet login. Med brugerens JWT er det kun
// ejeren, der læser og skriver (RLS), og kun kolonnerne i kolonne-grants (M1). `setPhotoPath` kræver service role-klienten
// (photo_path og photo_updated_at skrives af serveren efter upload, 2.3 d).
export class ClinicDentistsRepository extends BaseRepository<DentistRow, DentistRecordDto> {
  protected toDto(row: DentistRow): DentistRecordDto {
    return {
      id: row.id,
      fullName: row.full_name,
      title: row.title,
      bio: row.bio,
      photoUrl: row.photo_path ? PublicMediaStorage.publicUrl(row.photo_path, row.photo_updated_at ? Date.parse(row.photo_updated_at) : undefined)
        : null,
      sortOrder: row.sort_order,
    };
  }

  // Tandlæger i den rækkefølge, klinikken har valgt.
  async list(clinicId: string): Promise<DentistRecordDto[]> {
    return this.toDtos(
      await this.runList<DentistRow>(
        this.db
          .from("clinic_dentists")
          .select(DENTIST_COLUMNS)
          .eq("clinic_id", clinicId)
          .order("sort_order")
          .order("created_at"),
        "clinic_dentists: list fejlede",
      ),
    );
  }

  // Tandlægen, hvis den tilhører klinikken; 404 ellers (architecture 2.4).
  async requireOwn(clinicId: string, dentistId: string): Promise<DentistRecordDto> {
    const row = await this.run<DentistRow>(
      this.db.from("clinic_dentists").select(DENTIST_COLUMNS).eq("clinic_id", clinicId).eq("id", dentistId).maybeSingle(),
      "clinic_dentists: select fejlede",
    );
    return this.toDto(this.requireRow(row));
  }

  async create(clinicId: string, input: NewDentist): Promise<DentistRecordDto> {
    const row = await this.run<DentistRow>(
      this.db
        .from("clinic_dentists")
        .insert({
          clinic_id: clinicId,
          full_name: input.fullName,
          title: input.title ?? null,
          bio: input.bio ?? null,
          sort_order: input.sortOrder ?? 0,
        })
        .select(DENTIST_COLUMNS)
        .single(),
      "clinic_dentists: insert fejlede",
      { DENTIST_LIMIT: new ApiError(429, "DENTIST_LIMIT", `Du kan højst oprette ${MAX_DENTISTS_PER_CLINIC} tandlæger.`) },
    );
    return this.toDto(this.requireRow(row));
  }

  async update(clinicId: string, dentistId: string, patch: DentistPatch): Promise<DentistRecordDto> {
    const row = await this.patchRow(
      patch,
      { fullName: "full_name", title: "title", bio: "bio", sortOrder: "sort_order" },
      {
        update: (columns) =>
          this.db
            .from("clinic_dentists")
            .update(columns)
            .eq("clinic_id", clinicId)
            .eq("id", dentistId)
            .select(DENTIST_COLUMNS)
            .maybeSingle(),
        current: () =>
          this.db.from("clinic_dentists").select(DENTIST_COLUMNS).eq("clinic_id", clinicId).eq("id", dentistId).maybeSingle(),
      },
      "clinic_dentists: update fejlede",
    );
    return this.toDto(row);
  }

  // Stien til portrættet (eller null) - filen i public-media slettes af kalderen. Kun med service role-klienten (2.3 d).
  // Sætter kun stien, hvis brugeren stadig ejer klinikken, og tandlægen tilhører den; 404 ellers (fx efter kontosletning).
  // Returnerer versionen (photo_updated_at), som bruges som ?v= i portrættets URL (9.5).
  async setPhotoPath(ownerId: string, clinicId: string, dentistId: string, path: string | null): Promise<string> {
    const owned = await this.run<{ id: string }>(
      this.db.from("clinics").select("id").eq("id", clinicId).eq("owner_id", ownerId).maybeSingle(),
      "clinics: select fejlede",
    );
    this.requireRow(owned);
    const version = new Date().toISOString();
    const row = await this.run<Pick<DentistRow, "id">>(
      this.db
        .from("clinic_dentists")
        .update({ photo_path: path, photo_updated_at: version })
        .eq("clinic_id", clinicId)
        .eq("id", dentistId)
        .select("id")
        .maybeSingle(),
      "clinic_dentists: foto fejlede",
    );
    this.requireRow(row);
    return version;
  }

  // Sletter tandlægen; porteføljen følger med via cascade. Filerne i public-media slettes af kalderen.
  async delete(clinicId: string, dentistId: string): Promise<void> {
    const rows = await this.runList<Pick<DentistRow, "id">>(
      this.db.from("clinic_dentists").delete().eq("clinic_id", clinicId).eq("id", dentistId).select("id"),
      "clinic_dentists: delete fejlede",
    );
    this.requireRow(rows[0]);
  }
}
