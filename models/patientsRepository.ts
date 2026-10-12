import "server-only";
import type { PatientMeDto } from "@/lib/types/patients";
import { BaseRepository } from "@/models/base/baseRepository";

type PatientRow = { first_name: string | null; postal_code: string | null };

export type PatientPatch = { firstName?: string; postalCode?: string };

export class PatientsRepository extends BaseRepository<PatientRow, PatientMeDto> {
  protected toDto(row: PatientRow): PatientMeDto {
    return { firstName: row.first_name ?? null, postalCode: row.postal_code ?? null };
  }

  async findById(userId: string): Promise<PatientMeDto | null> {
    const row = await this.run<PatientRow>(
      this.db.from("patients").select("first_name, postal_code").eq("id", userId).maybeSingle(),
      "patients: select fejlede",
    );
    return row ? this.toDto(row) : null;
  }

  async requireById(userId: string): Promise<PatientMeDto> {
    return this.requireRow(await this.findById(userId));
  }

  async update(userId: string, patch: PatientPatch): Promise<void> {
    const columns = {
      ...(patch.firstName !== undefined ? { first_name: patch.firstName } : {}),
      ...(patch.postalCode !== undefined ? { postal_code: patch.postalCode } : {}),
    };
    if (Object.keys(columns).length === 0) return;
    await this.run(this.db.from("patients").update(columns).eq("id", userId), "patients: update fejlede");
  }
}
