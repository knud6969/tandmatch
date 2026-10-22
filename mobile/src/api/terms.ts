import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/identity/constants/legal";
import type { TermsAcceptResultDto } from "@/lib/identity/types/auth";
import { saveTermsToken, notifyAuthChange } from "~/auth/tokens";
import { ApiRequestError, apiRequest } from "./client";

// Accepterer vilkår og privatlivspolitik og gemmer vilkårstokenet (architecture 2.5 punkt 3).
export async function acceptTerms(): Promise<void> {
  const result = await apiRequest<TermsAcceptResultDto>("/api/terms/accept", {
    method: "POST",
    json: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
  });
  if (!result.termsToken) throw new ApiRequestError(500, "INTERNAL", "");
  await saveTermsToken(result.termsToken);
  notifyAuthChange();
}
