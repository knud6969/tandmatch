import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INBOX_LIST_LIMIT, INBOX_UNREAD_CAP } from "@/lib/common/constants/notifications";
import type { NotificationInboxDto } from "@/lib/common/types/notifications";
import type { Session } from "@/platform/middleware/session";
import { NotificationInboxRepository } from "@/platform/notifications/notificationInboxRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type NotificationInboxDeps = { inbox: NotificationInboxRepository };

// Klokken for klinikker og patienter med konto (platform 14.11). Oprettes pr. request med brugerens klient; routen har afvist
// andre roller og anonyme, og RLS giver kun brugerens egne rækker. Holder ingen tilstand.
export class NotificationInboxController {
  private readonly inbox: NotificationInboxRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<NotificationInboxDeps> = {},
  ) {
    this.inbox = deps.inbox ?? new NotificationInboxRepository(supabase);
  }

  // De nyeste og antallet af ulæste. Kaldes også af pollingen, så det er to små forespørgsler.
  async list(): Promise<NotificationInboxDto> {
    const [items, unreadCount] = await Promise.all([this.inbox.listLatest(INBOX_LIST_LIMIT), this.inbox.countUnread(INBOX_UNREAD_CAP)]);
    return { items, unreadCount };
  }

  // De angivne notifikationer, eller alle egne, hvis `ids` mangler.
  async markRead(ids?: readonly string[]): Promise<void> {
    await this.inbox.markRead(ids ?? null);
  }
}
