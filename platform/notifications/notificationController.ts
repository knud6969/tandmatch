import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lazyAdminClient } from "@/platform/db/admin";
import { createEmailService, createPushService, createSmsService, createWebPushService } from "@/platform/notifications/notificationServices";
import { NotificationDispatcher, type FlushSummary } from "@/platform/notifications/notificationDispatcher";
import { NotificationOutboxRepository } from "@/platform/notifications/notificationOutboxRepository";

const BATCH_SIZE = 20;
const MAX_BATCHES = 10;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type NotificationDeps = {
  admin: () => SupabaseClient;
  repository: NotificationOutboxRepository;
  dispatcher: NotificationDispatcher;
};

// Basisadressen til links i e-mails (platform 14.2): SITE_URL, ellers localhost uden for produktion, ellers ingen.
export function notificationSiteUrl(configured: string | undefined = process.env.SITE_URL, production = process.env.NODE_ENV === "production"): string | null {
  const value = configured?.trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      /* ugyldig adresse: behandles som manglende */
    }
    return null;
  }
  return production ? null : "http://localhost:3000";
}

// Sender notifikationerne fra outboxen og lægger påmindelser i den (platform 14.6). Ingen session og ingen brugerklient:
// kun service role-klienten (architecture 2.3 i). Holder ingen tilstand på tværs af kald. Ingen persondata i svar eller logs.
export class NotificationController {
  private readonly repository: NotificationOutboxRepository;
  private readonly dispatcher: NotificationDispatcher;

  constructor(deps: Partial<NotificationDeps> = {}) {
    // 2.3 (i): outboxen og modtagernes mål kan kun læses med service role.
    const admin = deps.admin ?? lazyAdminClient();
    this.repository = deps.repository ?? new NotificationOutboxRepository(admin());
    this.dispatcher =
      deps.dispatcher ??
      new NotificationDispatcher({
        repository: this.repository,
        email: createEmailService(),
        push: createPushService(),
        sms: createSmsService(),
        webPush: createWebPushService(),
        siteUrl: () => notificationSiteUrl(),
      });
  }

  // Sender det, der er klar. Kaldes efter svaret fra routes med notify og af cron-routen.
  async flush(): Promise<FlushSummary> {
    return this.dispatcher.flush();
  }

  // Flere omgange, så en bunke (fx påmindelser til mange bookinger) ikke venter til næste kørsel.
  private async flushBatches(): Promise<FlushSummary> {
    const total: FlushSummary = { sent: 0, failed: 0, skipped: 0, retried: 0 };
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const part = await this.dispatcher.flush(BATCH_SIZE);
      total.sent += part.sent;
      total.failed += part.failed;
      total.skipped += part.skipped;
      total.retried += part.retried;
      if (part.sent + part.failed + part.skipped + part.retried < BATCH_SIZE) break;
    }
    return total;
  }

  // Lægger påmindelser dagen før i outboxen og sender dem (platform 14.8).
  // Og påmindelser om at skrive en anmeldelse dagen efter tiden (14.8).
  async sendBookingReminders(): Promise<FlushSummary & { enqueued: number; reviewReminders: number }> {
    const enqueued = await this.repository.enqueueBookingReminders();
    const reviewReminders = await this.repository.enqueueReviewReminders();
    return { enqueued, reviewReminders, ...(await this.flushBatches()) };
  }

  // Sikkerhedsnettet hvert 5. minut: send og ryd op.
  async runScheduled(): Promise<FlushSummary & { purged: number }> {
    const summary = await this.flushBatches();
    return { ...summary, purged: await this.repository.purge() };
  }
}
