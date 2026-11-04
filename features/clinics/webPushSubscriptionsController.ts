import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebPushSubscriptionInput } from "@/lib/clinics/types/web-push";
import type { Session } from "@/platform/middleware/session";
import { WebPushSubscriptionsRepository } from "@/features/clinics/webPushSubscriptionsRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type WebPushSubscriptionsDeps = { subscriptions: WebPushSubscriptionsRepository };

// Klinikejerens web push-abonnementer (clinics 10.19). Routen har afvist andre roller end klinik; databasen tjekker igen.
export class WebPushSubscriptionsController {
  private readonly subscriptions: WebPushSubscriptionsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<WebPushSubscriptionsDeps> = {},
  ) {
    this.subscriptions = deps.subscriptions ?? new WebPushSubscriptionsRepository(supabase);
  }

  register(input: WebPushSubscriptionInput): Promise<void> {
    return this.subscriptions.register(input);
  }

  // Afmelding ved logout fra den browser, eller når klinikken slår browser-notifikationer fra.
  remove(endpoint: string): Promise<void> {
    return this.subscriptions.remove(endpoint);
  }
}
