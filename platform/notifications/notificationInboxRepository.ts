import "server-only";
import { parseNotificationPayload, renderInboxContent } from "@/lib/common/domain/notifications";
import type { NotificationItemDto } from "@/lib/common/types/notifications";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";
import { unauthenticated } from "@/platform/middleware/http";

type InboxRow = Pick<Tables<"user_notifications">, "id" | "type" | "payload" | "read_at" | "created_at">;

// Brugerens notifikationer i klokken (platform 14.11, tabellen `user_notifications`). Brugerens JWT: RLS giver kun egne
// rækker, og kun mark_notifications_read() kan ændre dem. Teksterne renderes af rene funktioner i lib/ ud fra type og id'er.
export class NotificationInboxRepository extends BaseRepository<InboxRow, NotificationItemDto> {
  protected toDto(row: InboxRow): NotificationItemDto {
    const content = renderInboxContent(row.type, parseNotificationPayload(row.payload));
    return { id: row.id, type: row.type, ...content, readAt: row.read_at, createdAt: row.created_at };
  }

  // De nyeste først. En række, der ikke kan renderes (ødelagt payload), springes over frem for at vælte listen.
  async listLatest(limit: number): Promise<NotificationItemDto[]> {
    const rows = await this.runList<InboxRow>(
      this.db.from("user_notifications").select("id, type, payload, read_at, created_at").order("created_at", { ascending: false }).limit(limit),
      "user_notifications: select fejlede",
    );
    return rows.flatMap((row) => {
      try {
        return [this.toDto(row)];
      } catch {
        return [];
      }
    });
  }

  // Antal ulæste, optalt til højst `cap`.
  async countUnread(cap: number): Promise<number> {
    const rows = await this.runList<{ id: string }>(
      this.db.from("user_notifications").select("id").is("read_at", null).limit(cap),
      "user_notifications: ulæste fejlede",
    );
    return rows.length;
  }

  // Markerer egne som læst: de angivne, eller alle ved null. Fremmede og ukendte id'er rører ingenting.
  async markRead(ids: readonly string[] | null): Promise<void> {
    await this.rpc("mark_notifications_read", { p_ids: ids }, { UNAUTHENTICATED: unauthenticated() });
  }
}
