import { cronRoute } from "@/platform/middleware/cron";
import { CronController } from "@/platform/cronController";

// Opbevaring og filoprydning (security M3 og M4): sletter beskedbilleder 12 måneder efter sidste aktivitet i tråden og tømmer køen af
// filer, der skal slettes (pending_storage_paths). Beskyttet med CRON_SECRET i Authorization-headeren og undtaget fra vilkårs-gaten
// (2.5). Ingen persondata i svar eller logs. Kaldes hver time.
export const POST = cronRoute(() => new CronController().cleanupStorage());

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
