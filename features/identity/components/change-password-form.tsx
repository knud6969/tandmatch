"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/common/domain/field-errors";
import { changePasswordSchema } from "@/lib/identity/schemas/auth";

type Field = "currentPassword" | "newPassword" | "repeat";

const EMPTY = { currentPassword: "", newPassword: "", repeat: "" };

// Skift adgangskode (architecture 10.2). Kræver den nuværende; andre enheder logges ud.
export function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: Field) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<Field>(parsed.error));
      return;
    }
    if (values.repeat !== values.newPassword) {
      setErrors({ fields: { repeat: "De to adgangskoder er ikke ens." }, general: null });
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      await apiRequest<void>("/api/auth/account/password", { method: "POST", body: parsed.data });
      setValues(EMPTY);
      setDone(true);
    } catch (e) {
      setErrors({ fields: {}, general: apiErrorMessage(e) });
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title="Adgangskoden er skiftet">
        Du er stadig logget ind her. Andre enheder skal logge ind igen.
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
      <TextField label="Nuværende adgangskode" name="currentPassword" type="password" autoComplete="current-password" value={values.currentPassword} onChange={set("currentPassword")} error={errors.fields.currentPassword} required />
      <TextField label="Ny adgangskode" name="newPassword" type="password" autoComplete="new-password" hint="Mindst 8 tegn." value={values.newPassword} onChange={set("newPassword")} error={errors.fields.newPassword} required />
      <TextField label="Gentag ny adgangskode" name="repeat" type="password" autoComplete="new-password" value={values.repeat} onChange={set("repeat")} error={errors.fields.repeat} required />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "Gemmer …" : "Skift adgangskode"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Fortryd
        </Button>
      </div>
    </form>
  );
}
