"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { ChoiceGroup } from "@/views/components/ui/choice-group";
import { TextArea } from "@/views/components/ui/text-area";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { PRICE_ACCURACY_OPTIONS } from "@/lib/constants/standard";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { formatPriceRange, parseWholeKr } from "@/views/utils/format";
import { createReviewSchema } from "@/lib/schemas/standard";
import type { EligibleVisitDto, PriceAccuracy } from "@/lib/types/standard";

type FormValues = {
  stars: string | null;
  text: string;
  priceAccuracy: PriceAccuracy | null;
  actualPrice: string;
  lackedTransparency: boolean;
  transparencyComment: string;
};

type FieldKey = keyof FormValues | "visitId";

const STAR_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: n === 1 ? "1 stjerne" : `${n} stjerner`,
}));

// Anmeldelse af ét verificeret besøg. Første gang tjekkes besøget mod patientens liste, så kun eligible besøg kan anmeldes.
export function ReviewForm({ visitId }: { visitId: string }) {
  const [visit, setVisit] = useState<EligibleVisitDto | null | "missing">(null);
  const [values, setValues] = useState<FormValues>({
    stars: null,
    text: "",
    priceAccuracy: null,
    actualPrice: "",
    lackedTransparency: false,
    transparencyComment: "",
  });
  const [errors, setErrors] = useState<FieldErrors<FieldKey>>({ fields: {}, general: null });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: EligibleVisitDto[] }>("/api/reviews/eligible")
      .then(({ items }) => {
        if (active) setVisit(items.find((item) => item.visitId === visitId) ?? "missing");
      })
      .catch(() => {
        if (active) setVisit("missing");
      });
    return () => {
      active = false;
    };
  }, [visitId]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, fields: { ...prev.fields, [key]: undefined } }));
  }

  async function submit() {
    setServerError(null);
    const fields: Partial<Record<FieldKey, string>> = {};
    if (values.stars === null) fields.stars = "Vælg antal stjerner.";
    if (values.priceAccuracy === null) fields.priceAccuracy = "Vælg et svar om prisen.";
    let actualPrice: number | null = null;
    if (values.actualPrice.trim() !== "") {
      actualPrice = parseWholeKr(values.actualPrice);
      if (actualPrice === null) fields.actualPrice = "Angiv den faktiske pris i hele kroner, fx 2400.";
    }
    if (Object.keys(fields).length > 0) {
      setErrors({ fields, general: null });
      return;
    }

    const parsed = createReviewSchema.safeParse({
      visitId,
      stars: Number(values.stars),
      text: values.text,
      priceAccuracy: values.priceAccuracy,
      actualPrice,
      lackedTransparency: values.lackedTransparency,
      transparencyComment: values.lackedTransparency ? values.transparencyComment.trim() || null : null,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<FieldKey>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });

    setPending(true);
    try {
      await apiRequest<{ id: string; moderationStatus: string }>("/api/reviews", { method: "POST", body: parsed.data });
      setPending(false);
      setSubmitted(true);
    } catch (err) {
      setPending(false);
      setServerError(apiErrorMessage(err));

    }
  }

  if (visit === null) {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser besøget …
      </p>
    );
  }

  if (visit === "missing") {
    return (
      <Alert tone="warning" title="Besøget kan ikke anmeldes">
        <p>Besøget findes ikke på din konto, eller du har allerede anmeldt det.</p>
        <LinkButton href="/patient/anmeldelser" variant="secondary" className="mt-4 w-full sm:w-auto">
          Til anmeldelser
        </LinkButton>
      </Alert>
    );
  }

  if (submitted) {
    return (
      <Alert tone="success" title="Tak for din anmeldelse" role="status">
        <p>
          Din anmeldelse er modtaget og afventer moderation. Den vises offentligt først, når den er godkendt.
        </p>
        <LinkButton href="/patient/anmeldelser" variant="secondary" className="mt-4 w-full sm:w-auto">
          Til anmeldelser
        </LinkButton>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-ink">{visit.dentistName ?? "Tandlæge"}</p>
        {visit.clinicName && <p className="text-base text-ink-muted">{visit.clinicName}</p>}
        {visit.quotedPrice && (
          <p className="text-base text-ink-muted">
            Prisoverslag: {formatPriceRange(visit.quotedPrice.min, visit.quotedPrice.max)}
          </p>
        )}
      </Card>

      <Alert tone="info" title="Anmeldelsen modereres">
        <p>Din anmeldelse bliver gennemgået, før den offentliggøres. Skriv ikke navne eller kontaktoplysninger om andre.</p>
      </Alert>

      <form noValidate aria-label="Anmeldelse" className="flex flex-col gap-7" onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}>
        {serverError && (
          <Alert tone="danger" role="alert">
            {serverError}
          </Alert>
        )}

        <ChoiceGroup
          legend="Hvor mange stjerner giver du?"
          options={STAR_OPTIONS}
          value={values.stars}
          onChange={(value) => update("stars", value)}
          error={errors.fields.stars}
        />

        <TextArea
          label="Din anmeldelse"
          hint="Fortæl kort om dit besøg. Mindst 20 tegn, højst 2000."
          value={values.text}
          onChange={(event) => update("text", event.target.value)}
          error={errors.fields.text}
          rows={5}
        />

        <ChoiceGroup
          legend="Svarede den endelige pris til prisoverslaget?"
          options={PRICE_ACCURACY_OPTIONS}
          value={values.priceAccuracy}
          onChange={(value) => update("priceAccuracy", value)}
          error={errors.fields.priceAccuracy}
        />

        <TextField
          label="Den faktiske pris (kr., valgfri)"
          hint="Hvis du kender den endelige pris, kan du skrive den her."
          inputMode="numeric"
          value={values.actualPrice}
          onChange={(event) => update("actualPrice", event.target.value)}
          error={errors.fields.actualPrice}
        />

        <div className="flex flex-col gap-4">
          <CheckboxField
            label="Der manglede gennemsigtighed i prisen"
            checked={values.lackedTransparency}
            onChange={(event) => update("lackedTransparency", event.target.checked)}
          />
          {values.lackedTransparency && (
            <TextArea
              label="Hvad manglede? (valgfri)"
              hint="Fx at prisen ikke var nævnt på forhånd, eller at ekstra udgifter ikke blev forklaret."
              value={values.transparencyComment}
              onChange={(event) => update("transparencyComment", event.target.value)}
              error={errors.fields.transparencyComment}
              rows={3}
            />
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Sender …" : "Send anmeldelse"}
          </Button>
        </div>
      </form>
    </div>
  );
}
