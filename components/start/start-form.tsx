"use client";

import { useState, type FormEvent } from "react";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { ChoiceGroup, type ChoiceOption } from "@/components/ui/choice-group";
import { useSession } from "@/components/session/session-provider";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { CONSENT_TEXT_VERSIONS, CONSENT_TEXTS } from "@/lib/constants/consents";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/forms/field-errors";
import { AREA_HOME } from "@/lib/navigation/areas";
import { anonymousSessionSchema } from "@/lib/schemas/session";
import type { CosmeticCategory } from "@/lib/types/common";

// Pladsholder-kategorier (architecture 4.2, [ÅBEN] endelig liste).
const CATEGORY_OPTIONS: ChoiceOption<CosmeticCategory>[] = [
  { value: "diastema", label: "Mellemrum mellem tænderne" },
  { value: "facings", label: "Facader (skaller)" },
  { value: "blegning", label: "Blegning" },
  { value: "retainer", label: "Retainer" },
  { value: "andet_kosmetisk", label: "Andet kosmetisk ønske" },
];

type StartField = "category" | "aiConsent";

type StartResult = { expiresAt: string };

const dateFormat: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" };

export function StartForm() {
  const { state, refresh } = useSession();
  const [category, setCategory] = useState<CosmeticCategory | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<StartField>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<StartResult | null>(null);

  if (state.status === "loading") {
    return <p role="status" className="text-base text-ink-muted">Indlæser …</p>;
  }

  const me = state.status === "ready" ? state.me : null;
  if (me && !me.isAnonymous) {
    return (
      <Alert tone="info" title="Du er allerede logget ind">
        <p>Din samtale startes fra din konto. Gå til din side for at fortsætte.</p>
        <LinkButton href={AREA_HOME[me.role]} className="mt-3">
          Gå til min side
        </LinkButton>
      </Alert>
    );
  }

  if (result) {
    const expires = new Date(result.expiresAt).toLocaleString("da-DK", dateFormat);
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="success" title="Din anonyme session er oprettet" role="status">
          <p>
            Din session gemmes til {expires}, hvis du ikke opretter en konto. Du skal have en konto, før en
            forespørgsel sendes til tandlæger.
          </p>
        </Alert>
        <Alert tone="info" title="Chatten kommer snart">
          <p>
            Selve samtalen med AI-assistenten er ikke klar endnu. Når den er klar, fortsætter du herfra.
          </p>
        </Alert>
        <LinkButton href="/" variant="secondary">
          Tilbage til forsiden
        </LinkButton>
      </div>
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
      imageConsent: imageConsent ? { textVersion: CONSENT_TEXT_VERSIONS.image_upload } : undefined,
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
      setResult({ expiresAt: data.expiresAt });
    } catch (error) {
      setErrors({ fields: {}, general: apiErrorMessage(error) });
    } finally {
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

      <div className="flex flex-col gap-3">
        <CheckboxField
          name="aiConsent"
          checked={aiConsent}
          onChange={(e) => setAiConsent(e.target.checked)}
          error={errors.fields.aiConsent}
          label={CONSENT_TEXTS.ai_processing}
        />
        <CheckboxField
          name="imageConsent"
          checked={imageConsent}
          onChange={(e) => setImageConsent(e.target.checked)}
          label={`Valgfrit: ${CONSENT_TEXTS.image_upload}`}
        />
      </div>

      <AiDisclaimer />

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Starter …" : "Start samtale"}
      </Button>
    </form>
  );
}
