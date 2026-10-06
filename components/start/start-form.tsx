"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { useSession } from "@/components/session/session-provider";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { CATEGORY_OPTIONS } from "@/lib/constants/category-labels";
import { CONSENT_TEXT_VERSIONS, CONSENT_TEXTS } from "@/lib/constants/consents";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/forms/field-errors";
import { anonymousSessionSchema } from "@/lib/schemas/session";
import type { CosmeticCategory } from "@/lib/types/common";

type StartField = "category" | "aiConsent";

type StartResult = { requestId: string; expiresAt: string };

// Første skridt på /start: kategori og AI-samtykke. Billedsamtykke gives først i billedtrinnet (architecture 0.7, 9.4).
export function StartForm() {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [category, setCategory] = useState<CosmeticCategory | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<StartField>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);

  if (state.status === "loading") {
    return <p role="status" className="text-base text-ink-muted">Indlæser …</p>;
  }

  const me = state.status === "ready" ? state.me : null;
  if (me && !me.isAnonymous) {
    return (
      <Alert tone="info" title="Du er logget ind">
        <p>Du starter en ny forespørgsel fra din konto.</p>
        <LinkButton href="/patient/forespoergsel/ny" className="mt-3 w-full sm:w-auto">
          Start ny forespørgsel
        </LinkButton>
      </Alert>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Danske fejl til de to påkrævede valg, før skemaet (som har tekniske standardfejl) valideres.
    const missing: FieldErrors<StartField> = { fields: {}, general: null };
    if (!category) missing.fields.category = "Vælg hvad din henvendelse handler om.";
    if (!aiConsent) missing.fields.aiConsent = "Du skal give samtykke for at starte en samtale.";
    if (missing.fields.category || missing.fields.aiConsent) {
      setErrors(missing);
      return;
    }
    const parsed = anonymousSessionSchema.safeParse({
      category,
      aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing },
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<StartField>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      const data = await apiRequest<StartResult>("/api/session/anonymous", {
        method: "POST",
        body: parsed.data,
      });
      await refresh();
      router.push(`/start/${data.requestId}`);
    } catch (error) {
      setErrors({ fields: {}, general: apiErrorMessage(error) });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-7">
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}

      <ChoiceGroup
        legend="Hvad drejer din henvendelse sig om?"
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={(value) => {
          setCategory(value);
          setErrors((e) => ({ ...e, fields: { ...e.fields, category: undefined } }));
        }}
        error={errors.fields.category}
      />

      <CheckboxField
        name="aiConsent"
        checked={aiConsent}
        onChange={(e) => setAiConsent(e.target.checked)}
        error={errors.fields.aiConsent}
        label={CONSENT_TEXTS.ai_processing}
      />

      <AiDisclaimer />

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Starter …" : "Start samtale"}
      </Button>
    </form>
  );
}
