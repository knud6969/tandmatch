import { cronRoute } from "@/platform/middleware/cron";
import { CronController } from "@/platform/cronController";

// Skriver den effektive bookingstatus ned: gennemførte tider bliver `completed`, udløbne reservationer `cancelled`
// (architecture 5.3, 10.10). Beskyttet med CRON_SECRET i Authorization-headeren og undtaget fra vilkårs-gaten (2.5).
// Ingen persondata i svar eller logs.
export const POST = cronRoute(() => new CronController().completeBookings());

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
