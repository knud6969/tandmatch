import { cronRoute } from "@/platform/middleware/cron";
import { CronController } from "@/platform/cronController";

// Sletter anonyme sessioner 48 timer efter sidste aktivitet (architecture 7.7).
// Beskyttet med CRON_SECRET i Authorization-headeren. Ingen persondata i svar eller logs.
export const POST = cronRoute(() => new CronController().cleanupAnonymous());

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
