import { LeadsController } from "@/features/leads/leadsController";
import { LEADS_SEND_IP_LIMIT_PER_HOUR } from "@/lib/common/constants/limits";
import { emergencyLeadSchema } from "@/lib/leads/schemas/leads";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Akutvejen (architecture 10.11): opretter en akutsag, sender den til én klinik og reserverer tiden i ét kald.
// Kræver konto; anonyme får ACCOUNT_REQUIRED.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.emergencyLead,
  );
  await enforceIpRateLimit("leads-send", req, LEADS_SEND_IP_LIMIT_PER_HOUR);
  const input = await readJson(req, emergencyLeadSchema);
  return jsonResponse(await new LeadsController(gate.supabase, session).sendEmergency(input), 201);
});
