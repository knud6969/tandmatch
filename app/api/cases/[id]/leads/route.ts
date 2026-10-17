import { LeadsController } from "@/controllers/leadsController";
import { LEADS_SEND_IP_LIMIT_PER_HOUR } from "@/lib/constants/limits";
import { sendLeadsSchema } from "@/lib/schemas/leads";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireAccount, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Sender sagen til 1-3 klinikker (architecture 10.5). Kræver konto; anonyme får ACCOUNT_REQUIRED.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.sendLeads,
  );
  await enforceIpRateLimit("leads-send", req, LEADS_SEND_IP_LIMIT_PER_HOUR);
  const caseId = parseId((await params).id);
  const input = await readJson(req, sendLeadsSchema);
  return jsonResponse({ leads: await new LeadsController(gate.supabase, session).send(caseId, input) }, 201);
});

// Sagens leads. En anonym patient ejer sagen, men har ingen leads (tom liste).
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  return jsonResponse({ leads: await new LeadsController(gate.supabase, session).listForCase(caseId) });
});
