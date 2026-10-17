import { LeadsController } from "@/controllers/leadsController";
import { withdrawLeadSchema } from "@/lib/schemas/leads";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireAccount, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten trækker et ubesvaret lead tilbage (architecture 10.5). 409 LEAD_NOT_PENDING, hvis klinikken har svaret.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.withdrawLead,
  );
  const leadId = parseId((await params).id);
  await readJson(req, withdrawLeadSchema);
  return jsonResponse(await new LeadsController(gate.supabase, session).withdraw(leadId));
});
