import "server-only";
import type { z } from "zod";
import type { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";

type PatientRow = Pick<Tables<"patients">, "first_name" | "postal_code" | "phone">;

const PATIENT_COLUMNS = "first_name, postal_code, phone";

type PatientPatch = z.infer<typeof patchPatientSchema>;

export class PatientsRepository extends BaseRepository<PatientRow, PatientMeDto> {
  protected toDto(row: PatientRow): PatientMeDto {
    return { firstName: row.first_name ?? null, postalCode: row.postal_code ?? null, phone: row.phone ?? null };
  }

  async findById(userId: string): Promise<PatientMeDto | null> {
    const row = await this.run(
      this.db.from("patients").select(PATIENT_COLUMNS).eq("id", userId).maybeSingle(),
      "patients: select fejlede",
    );
    return row ? this.toDto(row) : null;
  }

  async requireById(userId: string): Promise<PatientMeDto> {
    return this.requireRow(await this.findById(userId));
  }

  async update(userId: string, patch: PatientPatch): Promise<PatientMeDto> {
    const row = await this.patchRow(
      patch,
      { firstName: "first_name", postalCode: "postal_code", phone: "phone" },
      {
        update: (columns) =>
          this.db.from("patients").update(columns).eq("id", userId).select(PATIENT_COLUMNS).maybeSingle(),
        current: () => this.db.from("patients").select(PATIENT_COLUMNS).eq("id", userId).maybeSingle(),
      },
      "patients: update fejlede",
    );
    return this.toDto(row);
  }
}
