import { cronRoute } from "@/platform/middleware/cron";
import { NotificationController } from "@/platform/notifications/notificationController";

// Sikkerhedsnettet for notifikationer (platform 14.1): sender det, der ligger i outboxen, og rydder gamle rækker.
// Kaldes hvert 5. minut. Beskyttet med CRON_SECRET og undtaget fra vilkårs-gaten. Ingen persondata i svar eller logs.
export const POST = cronRoute(() => new NotificationController().runScheduled());

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
