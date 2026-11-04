import "server-only";
import type { WebPushSubscriptionInput } from "@/lib/clinics/types/web-push";
import { BaseRepository } from "@/platform/base/baseRepository";
import { forbidden, unauthenticated } from "@/platform/middleware/http";

// Klinikejerens browser-abonnementer til web push (platform 14). Skrivning kun via register_web_push_subscription();
// læsning og sletning kun af egne rækker (RLS). Endpoint og nøgler logges aldrig.
export class WebPushSubscriptionsRepository extends BaseRepository {
  async register(input: WebPushSubscriptionInput): Promise<void> {
    await this.rpc(
      "register_web_push_subscription",
      { p_endpoint: input.endpoint, p_p256dh: input.keys.p256dh, p_auth: input.keys.auth },
      { FORBIDDEN: forbidden(), UNAUTHENTICATED: unauthenticated() },
    );
  }

  // Sletter kun egne rækker; et fremmed eller ukendt endpoint giver ingen fejl og ingen sletning.
  async remove(endpoint: string): Promise<void> {
    await this.run(this.db.from("web_push_subscriptions").delete().eq("endpoint", endpoint), "web_push_subscriptions: delete fejlede");
  }
}
