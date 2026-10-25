"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/common/domain/field-errors";
import { changeEmailSchema } from "@/lib/identity/schemas/auth";

type Field = "email" | "currentPassword";

// Skift login-e-mail (architecture 10.2). E-mailen skifter først, når linkene i e-mailene er bekræftet.
export function ChangeEmailForm({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState({ email: "", currentPassword: "" });
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = changeEmailSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<Field>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      await apiRequest<{ sent: true }>("/api/auth/account/email", { method: "POST", body: parsed.data });
      setSentTo(parsed.data.email);
    } catch (e) {
      setErrors({ fields: {}, general: apiErrorMessage(e) });
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <Alert tone="success" title="Bekræft den nye e-mail">
        Vi har sendt et link til {sentTo}, og evt. også til din nuværende adresse. Din login-e-mail skifter, når du har
        bekræftet. Indtil da logger du ind som før.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}
      <TextField
        label="Ny e-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={values.email}
        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        error={errors.fields.email}
        required
      />
      <TextField
        label="Nuværende adgangskode"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={(e) => setValues((v) => ({ ...v, currentPassword: e.target.value }))}
        error={errors.fields.currentPassword}
        required
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "Sender …" : "Skift e-mail"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Fortryd
        </Button>
      </div>
    </form>
  );
}
