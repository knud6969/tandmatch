import "server-only";
import type { NotificationContactDto, NotificationContactExportDto } from "@/lib/identity/types/notification-contact";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";
import { forbidden } from "@/platform/middleware/http";

type ContactRow = Pick<Tables<"patient_notification_contacts">, "email" | "phone" | "updated_at">;

const COLUMNS = "email, phone, updated_at";

// Patientens e-mail og nummer til notifikationer (identity 4.3 `patient_notification_contacts`). Brugerens JWT: RLS giver kun
// egen række, og klinikker kan aldrig læse tabellen. Værdierne logges aldrig og indgår aldrig i outboxen.
export class NotificationContactRepository extends BaseRepository<ContactRow, NotificationContactExportDto> {
  protected toDto(row: ContactRow): NotificationContactExportDto {
    return { email: row.email ?? null, phone: row.phone ?? null, updatedAt: row.updated_at };
  }

  // Ingen række = ingen valg (begge null).
  async findOwn(): Promise<NotificationContactDto> {
    const row = await this.run<ContactRow>(this.db.from("patient_notification_contacts").select(COLUMNS).maybeSingle(), "patient_notification_contacts: select fejlede");
    return row ? { email: row.email ?? null, phone: row.phone ?? null } : { email: null, phone: null };
  }

  async save(patientId: string, contact: NotificationContactDto): Promise<NotificationContactDto> {
    const row = await this.run<ContactRow>(
      this.db
        .from("patient_notification_contacts")
        .upsert({ patient_id: patientId, email: contact.email, phone: contact.phone }, { onConflict: "patient_id" })
        .select(COLUMNS)
        .maybeSingle(),
      "patient_notification_contacts: upsert fejlede",
      { "row-level security": forbidden() },
    );
    const saved = this.requireRow(row);
    return { email: saved.email ?? null, phone: saved.phone ?? null };
  }

  // Til dataeksporten (GDPR art. 15/20).
  async listOwnForExport(): Promise<NotificationContactExportDto[]> {
    return this.toDtos(await this.runList<ContactRow>(this.db.from("patient_notification_contacts").select(COLUMNS), "patient_notification_contacts: eksport fejlede"));
  }
}
