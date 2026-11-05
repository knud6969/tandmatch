import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationContactDto } from "@/lib/identity/types/notification-contact";
import type { Session } from "@/platform/middleware/session";
import { NotificationContactRepository } from "@/features/identity/notificationContactRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type NotificationContactDeps = { contacts: NotificationContactRepository };

// Patientens e-mail og telefonnummer til notifikationer (identity 10.20). Routen har afvist anonyme og andre roller; databasen
// tjekker det igen. Inputtet er valideret af schemaet (telefon: phoneSchema).
export class NotificationContactController {
  private readonly contacts: NotificationContactRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<NotificationContactDeps> = {},
  ) {
    this.contacts = deps.contacts ?? new NotificationContactRepository(supabase);
  }

  getMine(): Promise<NotificationContactDto> {
    return this.contacts.findOwn();
  }

  saveMine(input: NotificationContactDto): Promise<NotificationContactDto> {
    return this.contacts.save(this.session.userId, input);
  }
}
