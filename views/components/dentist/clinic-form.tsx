"use client";

import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { patchClinicSchema } from "@/lib/schemas/dentists";
import type { ClinicDto } from "@/lib/types/dentists";

type FormValues = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  website: string;
  trustpilotUrl: string;
};

type FieldKey = keyof FormValues;

function valuesFrom(clinic: ClinicDto | null): FormValues {
  return {
    name: clinic?.name ?? "",
    address: clinic?.address ?? "",
    postalCode: clinic?.postalCode ?? "",
    city: clinic?.city ?? "",
    phone: clinic?.phone ?? "",
    website: clinic?.website ?? "",
    trustpilotUrl: clinic?.trustpilot.url ?? "",
  };
}

const REQUIRED: { key: FieldKey; message: string }[] = [
  { key: "name", message: "Angiv klinikkens navn." },
  { key: "address", message: "Angiv adressen." },
  { key: "postalCode", message: "Angiv postnummeret." },
  { key: "city", message: "Angiv byen." },
];

// Klinikken oprettes første gang, og tandlægen redigerer sin egen klinik bagefter (architecture 10.8).
// Tomme valgfri felter sendes som null, fordi URL-felterne ellers afvises af skemaet.
export function ClinicForm({ clinic, onSaved }: { clinic: ClinicDto | null; onSaved: (clinic: ClinicDto) => void }) {
  const [values, setValues] = useState<FormValues>(() => valuesFrom(clinic));
  const [errors, setErrors] = useState<FieldErrors<FieldKey>>({ fields: {}, general: null });
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function update(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, fields: { ...prev.fields, [key]: undefined } }));
    setSaved(false);
  }

  async function submit() {
    setServerError(null);
    setSaved(false);
    const fields: Partial<Record<FieldKey, string>> = {};
    for (const rule of REQUIRED) {
      if (values[rule.key].trim() === "") fields[rule.key] = rule.message;
    }
    if (Object.keys(fields).length > 0) {
      setErrors({ fields, general: null });
      return;
    }

    const parsed = patchClinicSchema.safeParse({
      name: values.name,
      address: values.address,
      postalCode: values.postalCode.trim(),
      city: values.city,
      phone: values.phone.trim() || null,
      website: values.website.trim() || null,
      trustpilotUrl: values.trustpilotUrl.trim() || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<FieldKey>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });

    setPending(true);
    try {
      const updated = await apiRequest<ClinicDto>("/api/clinics/me", { method: "PATCH", body: parsed.data });
      setPending(false);
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setPending(false);
      setServerError(apiErrorMessage(err));
    }
  }

  const submitLabel = clinic ? "Gem klinik" : "Opret klinik";

  return (
    <form
      noValidate
      aria-label="Klinik"
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
      {saved && (
        <Alert tone="success" role="status">
          Klinikken er gemt.
        </Alert>
      )}

      <TextField
        label="Klinikkens navn"
        autoComplete="organization"
        value={values.name}
        onChange={(event) => update("name", event.target.value)}
        error={errors.fields.name}
      />
      <TextField
        label="Adresse"
        autoComplete="street-address"
        value={values.address}
        onChange={(event) => update("address", event.target.value)}
        error={errors.fields.address}
      />
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <TextField
          label="Postnummer"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={4}
          value={values.postalCode}
          onChange={(event) => update("postalCode", event.target.value)}
          error={errors.fields.postalCode}
        />
        <TextField
          label="By"
          autoComplete="address-level2"
          value={values.city}
          onChange={(event) => update("city", event.target.value)}
          error={errors.fields.city}
        />
      </div>
      <TextField
        label="Telefon (valgfri)"
        type="tel"
        autoComplete="tel"
        value={values.phone}
        onChange={(event) => update("phone", event.target.value)}
        error={errors.fields.phone}
      />
      <TextField
        label="Hjemmeside (valgfri)"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={values.website}
        onChange={(event) => update("website", event.target.value)}
        error={errors.fields.website}
      />
      <TextField
        label="Trustpilot-link (valgfri)"
        hint="Linket til klinikkens side på dk.trustpilot.com eller www.trustpilot.com. TandMatch henter ikke data fra Trustpilot, så score og antal skal angives af klinikken."
        type="url"
        inputMode="url"
        placeholder="https://dk.trustpilot.com/review/…"
        value={values.trustpilotUrl}
        onChange={(event) => update("trustpilotUrl", event.target.value)}
        error={errors.fields.trustpilotUrl}
      />

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Gemmer …" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
