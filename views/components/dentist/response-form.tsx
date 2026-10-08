"use client";

import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { TextArea } from "@/views/components/ui/text-area";
import { TextField } from "@/views/components/ui/text-field";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage, STALE_STATE_CODES } from "@/views/utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { fromDateTimeLocal, parseWholeKr, toDateTimeLocal } from "@/views/utils/format";
import { createResponseSchema } from "@/lib/schemas/responses";
import type { ResponseDto } from "@/lib/types/responses";
import type { z } from "zod";

type CreateResponseInput = z.infer<typeof createResponseSchema>;

type FormValues = {
  assessment: string;
  priceMin: string;
  priceMax: string;
  priceNote: string;
  firstAvailableAt: string;
  offer: string;
  validUntil: string;
};

type FieldKey = keyof FormValues;

const EMPTY: FormValues = {
  assessment: "",
  priceMin: "",
  priceMax: "",
  priceNote: "",
  firstAvailableAt: "",
  offer: "",
  validUntil: "",
};

function valuesFrom(response: ResponseDto | undefined): FormValues {
  if (!response) return EMPTY;
  return {
    assessment: response.assessment,
    priceMin: String(response.priceMin),
    priceMax: String(response.priceMax),
    priceNote: response.priceNote ?? "",
    firstAvailableAt: response.firstAvailableAt ? toDateTimeLocal(response.firstAvailableAt) : "",
    offer: response.offer ?? "",
    validUntil: response.validUntil ?? "",
  };
}

// Validerer med det delte zod-skema (lib/schemas/responses.ts). Tomme pris-felter fanges først, så beskeden er dansk.
function validate(values: FormValues): { data: CreateResponseInput | null; errors: FieldErrors<FieldKey> } {
  const fields: Partial<Record<FieldKey, string>> = {};
  const priceMin = parseWholeKr(values.priceMin);
  const priceMax = parseWholeKr(values.priceMax);
  if (values.assessment.trim() === "") fields.assessment = "Skriv din vurdering.";
  if (priceMin === null) fields.priceMin = "Angiv den laveste pris i hele kroner, fx 1500.";
  if (priceMax === null) fields.priceMax = "Angiv den højeste pris i hele kroner, fx 2500.";
  if (Object.keys(fields).length > 0) return { data: null, errors: { fields, general: null } };

  const parsed = createResponseSchema.safeParse({
    assessment: values.assessment,
    priceMin,
    priceMax,
    priceNote: values.priceNote.trim() || null,
    firstAvailableAt: values.firstAvailableAt ? fromDateTimeLocal(values.firstAvailableAt) : null,
    offer: values.offer.trim() || null,
    validUntil: values.validUntil || null,
  });
  if (!parsed.success) return { data: null, errors: fieldErrorsFrom<FieldKey>(parsed.error) };
  return { data: parsed.data, errors: { fields: {}, general: null } };
}

type ResponseFormProps = {
  // Oprettelse: requestId. Redigering: initial (PATCH mod eget svar).
  requestId: string;
  initial?: ResponseDto;
  onSaved: (response: ResponseDto) => void;
  // Kaldes når serveren siger, at visningen er forældet, så siden henter data igen.
  onStale: () => void;
};

// Svarformular for tandlægen. Opretter svaret eller retter det, indtil patienten har valgt (API-regler).
export function ResponseForm({ requestId, initial, onSaved, onStale }: ResponseFormProps) {
  const [values, setValues] = useState<FormValues>(() => valuesFrom(initial));
  const [errors, setErrors] = useState<FieldErrors<FieldKey>>({ fields: {}, general: null });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = initial !== undefined;

  function update(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, fields: { ...prev.fields, [key]: undefined } }));
  }

  async function submit() {
    const { data, errors: found } = validate(values);
    setErrors(found);
    setServerError(null);
    if (!data) return;

    setPending(true);
    try {
      const response = initial
        ? await apiRequest<ResponseDto>(`/api/responses/${initial.id}`, { method: "PATCH", body: data })
        : await apiRequest<ResponseDto>(`/api/requests/${requestId}/responses`, { method: "POST", body: data });
      setPending(false);
      onSaved(response);
    } catch (err) {
      setPending(false);
      setServerError(apiErrorMessage(err));
      if (err instanceof ApiRequestError && (STALE_STATE_CODES as readonly string[]).includes(err.code)) {
        onStale();
      }
    }
  }

  return (
    <form
      noValidate
      aria-label={editing ? "Ret dit svar" : "Svar på forespørgslen"}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {serverError && (
        <Alert tone="danger" role="alert">
          {serverError}
        </Alert>
      )}
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}

      <TextArea
        label="Din vurdering"
        hint="Din personlige vurdering af patientens ønske. Skrives af dig, ikke af AI. Højst 2000 tegn."
        value={values.assessment}
        onChange={(event) => update("assessment", event.target.value)}
        error={errors.fields.assessment}
        rows={6}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Laveste pris (kr.)"
          inputMode="numeric"
          autoComplete="off"
          value={values.priceMin}
          onChange={(event) => update("priceMin", event.target.value)}
          error={errors.fields.priceMin}
        />
        <TextField
          label="Højeste pris (kr.)"
          inputMode="numeric"
          autoComplete="off"
          value={values.priceMax}
          onChange={(event) => update("priceMax", event.target.value)}
          error={errors.fields.priceMax}
        />
      </div>

      <TextField
        label="Hvad dækker prisen? (valgfri)"
        hint="Fx 'inkl. røntgen og første kontrol'. Højst 200 tegn."
        value={values.priceNote}
        onChange={(event) => update("priceNote", event.target.value)}
        error={errors.fields.priceNote}
      />

      <TextField
        label="Første ledige tid (valgfri)"
        type="datetime-local"
        value={values.firstAvailableAt}
        onChange={(event) => update("firstAvailableAt", event.target.value)}
        error={errors.fields.firstAvailableAt}
      />

      <TextArea
        label="Tilbud (valgfri)"
        hint="Fx en rabat eller et samlet forløb. Højst 1000 tegn."
        value={values.offer}
        onChange={(event) => update("offer", event.target.value)}
        error={errors.fields.offer}
        rows={3}
      />

      <TextField
        label="Tilbuddet gælder til (valgfri)"
        type="date"
        value={values.validUntil}
        onChange={(event) => update("validUntil", event.target.value)}
        error={errors.fields.validUntil}
      />

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Gemmer …" : editing ? "Gem ændringer" : "Send svar"}
        </Button>
      </div>
    </form>
  );
}
