import "server-only";
import type { z } from "zod";
import type { createDentistSchema, patchDentistSchema } from "@/lib/schemas/clinics";
import type { DentistRecordDto } from "@/lib/types/clinics";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";
import { PublicMediaStorage } from "@/models/publicMediaStorage";

export type NewDentist = z.infer<typeof createDentistSchema>;
export type DentistPatch = z.infer<typeof patchDentistSchema>;

type DentistRow = Pick<Tables<"clinic_dentists">, "id" | "full_name" | "title" | "bio" | "photo_path" | "photo_updated_at" | "sort_order">;

const DENTIST_COLUMNS = "id, full_name, title, bio, photo_path, photo_updated_at, sort_order";

// Klinikkens tandlæger (architecture 4.3 `clinic_dentists`): kun visning, intet login. Med brugerens JWT er det kun
// ejeren, der læser og skriver (RLS). Kun `deleteAllForClinic` kræver service role-klienten (2.3 f).
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

  async count(clinicId: string): Promise<number> {
    const { count, error } = await this.db
      .from("clinic_dentists")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId);
    if (error) throw new Error("clinic_dentists: count fejlede");
    return count ?? 0;
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
    );
    return this.toDto(this.requireRow(row));
  }

  async update(clinicId: string, dentistId: string, patch: DentistPatch): Promise<DentistRecordDto> {
    const columns = {
      ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.sortOrder !== undefined ? { sort_order: patch.sortOrder } : {}),
    };
    if (Object.keys(columns).length === 0) return this.requireOwn(clinicId, dentistId);
    const row = await this.run<DentistRow>(
      this.db
        .from("clinic_dentists")
        .update(columns)
        .eq("clinic_id", clinicId)
        .eq("id", dentistId)
        .select(DENTIST_COLUMNS)
        .maybeSingle(),
      "clinic_dentists: update fejlede",
    );
    return this.toDto(this.requireRow(row));
  }

  // Stien til portrættet (eller null) - filen i public-media slettes af kalderen.
  async setPhotoPath(clinicId: string, dentistId: string, path: string | null): Promise<void> {
    await this.run(
      this.db.from("clinic_dentists").update({ photo_path: path, photo_updated_at: new Date().toISOString() }).eq("clinic_id", clinicId).eq("id", dentistId),
      "clinic_dentists: foto fejlede",
    );
  }

  // Sletter tandlægen; porteføljen følger med via cascade. Filerne i public-media slettes af kalderen.
  async delete(clinicId: string, dentistId: string): Promise<void> {
    const rows = await this.runList<Pick<DentistRow, "id">>(
      this.db.from("clinic_dentists").delete().eq("clinic_id", clinicId).eq("id", dentistId).select("id"),
      "clinic_dentists: delete fejlede",
    );
    this.requireRow(rows[0]);
  }

  // Kontosletning: alle klinikkens tandlæger (og dermed portefølje) fjernes. Kun med service role-klienten.
  async deleteAllForClinic(clinicId: string): Promise<void> {
    await this.run(this.db.from("clinic_dentists").delete().eq("clinic_id", clinicId), "clinic_dentists: delete fejlede");
  }
}
