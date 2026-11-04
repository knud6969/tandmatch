import "server-only";
import type { NotificationChannel, NotificationType } from "@/lib/common/types/notifications";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Database } from "@/platform/db/database.types";
import type { WebPushTarget } from "@/platform/notifications/webPushService";

type ClaimRow = Database["public"]["Functions"]["claim_notifications"]["Returns"][number];

export type CompletionStatus = "sent" | "skipped" | "retry" | "failed";

// En række, dispatcheren har taget (claim_notifications). Målene er slået op af databasen på afsendelsestidspunktet.
export type ClaimedNotification = {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  payload: unknown;
  attempts: number;
  clinicId: string | null; // kun e-mail og web push (til logning)
  recipientUserId: string | null; // kun app-push (til logning)
  toEmail: string | null;
  pushTokens: string[];
  webPushSubscriptions: WebPushTarget[];
};

// Eneste vej til outboxen fra serveren (platform 14.5). Kun RPC'erne, og kun med service role-klienten (2.3 i).
export class NotificationOutboxRepository extends BaseRepository<ClaimRow, ClaimedNotification> {
  protected toDto(row: ClaimRow): ClaimedNotification {
    const subs = Array.isArray(row.web_push_subscriptions) ? (row.web_push_subscriptions as unknown[]) : [];
    return {
      id: row.id,
      type: row.type,
      channel: row.channel,
      payload: row.payload,
      attempts: row.attempts,
      clinicId: row.clinic_id ?? null,
      recipientUserId: row.recipient_user_id ?? null,
      toEmail: row.to_email ?? null,
      pushTokens: row.push_tokens ?? [],
      webPushSubscriptions: subs.filter(isTarget),
    };
  }

  async claim(limit: number): Promise<ClaimedNotification[]> {
    return this.toDtos(await this.rpc<ClaimRow[]>("claim_notifications", { p_limit: limit }));
  }

  // invalidTargets: push-tokens eller web push-endpoints, der ikke findes mere og slettes af databasen.
  async complete(id: string, status: CompletionStatus, errorCode?: string, invalidTargets?: string[]): Promise<void> {
    await this.rpc("complete_notification", {
      p_id: id,
      p_status: status,
      p_error_code: errorCode ?? null,
      p_invalid_tokens: invalidTargets && invalidTargets.length > 0 ? invalidTargets : null,
    });
  }

  async purge(): Promise<number> {
    return (await this.rpc<number>("purge_notifications", undefined)) ?? 0;
  }

  async enqueueBookingReminders(): Promise<number> {
    return (await this.rpc<number>("enqueue_booking_reminders", undefined)) ?? 0;
  }
}

function isTarget(value: unknown): value is WebPushTarget {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.endpoint === "string" && typeof v.p256dh === "string" && typeof v.auth === "string";
}
