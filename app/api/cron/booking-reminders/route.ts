import { cronRoute } from "@/platform/middleware/cron";
import { NotificationController } from "@/platform/notifications/notificationController";

// Påmindelser dagen før en booket tid (platform 14.8): lægger dem i outboxen og sender dem. Kaldes hver time.
// Beskyttet med CRON_SECRET og undtaget fra vilkårs-gaten. Ingen persondata i svar eller logs.
export const POST = cronRoute(() => new NotificationController().sendBookingReminders());

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
