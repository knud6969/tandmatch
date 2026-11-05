import { z } from "zod";
import { INBOX_MARK_MAX_IDS } from "@/lib/common/constants/notifications";

// POST /api/notifications/read: de angivne notifikationer, eller alle egne, hvis `ids` mangler.
export const markNotificationsReadSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(INBOX_MARK_MAX_IDS).optional() })
  .strict();

export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
