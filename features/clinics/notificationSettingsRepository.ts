import "server-only";
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_SETTING_COLUMN, NOTIFICATION_SETTING_KEYS } from "@/lib/clinics/constants/notification-settings";
import type { ClinicNotificationSettingsDto } from "@/lib/clinics/types/notification-settings";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";

type SettingsRow = Tables<"clinic_notification_settings">;

// Klinikkens valg af e-mail og browser-push (clinics 4.3 `clinic_notification_settings`). RLS: kun ejeren. Ingen række = standard.
export class NotificationSettingsRepository extends BaseRepository<SettingsRow, ClinicNotificationSettingsDto> {
  protected toDto(row: SettingsRow): ClinicNotificationSettingsDto {
    const dto = { ...DEFAULT_NOTIFICATION_SETTINGS } as Record<string, boolean>;
    for (const key of NOTIFICATION_SETTING_KEYS) dto[key] = row[NOTIFICATION_SETTING_COLUMN[key]];
    return dto as ClinicNotificationSettingsDto;
  }

  async find(clinicId: string): Promise<ClinicNotificationSettingsDto> {
    const row = await this.run<SettingsRow>(
      this.db.from("clinic_notification_settings").select("*").eq("clinic_id", clinicId).maybeSingle(),
      "clinic_notification_settings: select fejlede",
    );
    return row ? this.toDto(row) : { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  // Gemmer alle valg. clinic_id kan ikke opdateres af klienten (kolonne-grant), så en upsert kan ikke bruges: først UPDATE,
  // og findes rækken ikke, INSERT. Mister vi et kapløb om INSERT, prøves UPDATE én gang til.
  async save(clinicId: string, settings: ClinicNotificationSettingsDto): Promise<ClinicNotificationSettingsDto> {
    const columns: Record<string, boolean> = {};
    for (const key of NOTIFICATION_SETTING_KEYS) columns[NOTIFICATION_SETTING_COLUMN[key]] = settings[key];
    const update = () =>
      this.run<SettingsRow>(
        this.db.from("clinic_notification_settings").update(columns).eq("clinic_id", clinicId).select("*").maybeSingle(),
        "clinic_notification_settings: update fejlede",
      );
    let row = await update();
    if (!row) {
      try {
        row = await this.run<SettingsRow>(
          this.db.from("clinic_notification_settings").insert({ clinic_id: clinicId, ...columns }).select("*").maybeSingle(),
          "clinic_notification_settings: insert fejlede",
        );
      } catch {
        row = await update();
      }
    }
    return this.toDto(this.requireRow(row));
  }
}
