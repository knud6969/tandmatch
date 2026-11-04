import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicNotificationSettingsDto } from "@/lib/clinics/types/notification-settings";
import type { Session } from "@/platform/middleware/session";
import { ClinicsRepository } from "@/features/clinics/clinicsRepository";
import { NotificationSettingsRepository } from "@/features/clinics/notificationSettingsRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type NotificationSettingsDeps = { clinics: ClinicsRepository; settings: NotificationSettingsRepository };

// Klinikkens notifikationsindstillinger (clinics 10.19). Arbejder altid på sessionens egen klinik.
export class NotificationSettingsController {
  private readonly clinics: ClinicsRepository;
  private readonly settings: NotificationSettingsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<NotificationSettingsDeps> = {},
  ) {
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.settings = deps.settings ?? new NotificationSettingsRepository(supabase);
  }

  async get(): Promise<ClinicNotificationSettingsDto> {
    return this.settings.find(await this.clinics.requireOwnId(this.session.userId));
  }

  async put(input: ClinicNotificationSettingsDto): Promise<ClinicNotificationSettingsDto> {
    return this.settings.save(await this.clinics.requireOwnId(this.session.userId), input);
  }
}
