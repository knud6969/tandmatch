"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { TextField } from "@/views/components/ui/text-field";
import { useSession } from "@/views/components/session/session-provider";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { AREA_HOME } from "@/lib/navigation/areas";
import { convertSchema, signupSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";

type PatientField = "firstName" | "email" | "password";

type PatientSignupFormProps = {
  // Kaldes efter konto er oprettet eller konverteret. Uden den sendes brugeren til sin forside (bruges i wizarden).
  onDone?: () => void | Promise<void>;
};

// Opretter en patientkonto. Hvis brugeren har en anonym session, konverteres den i stedet,
// så samme bruger-id og samtale følger med (architecture 7.7).
export function PatientSignupForm({ onDone }: PatientSignupFormProps) {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [values, setValues] = useState({ firstName: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<PatientField>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);

  if (state.status === "loading") {
    return <p role="status" className="text-base text-ink-muted">Indlæser …</p>;
  }

  const me = state.status === "ready" ? state.me : null;
  if (me && !me.isAnonymous) {
    return (
      <Alert tone="info" title="Du er allerede logget ind">
        <p>Du kan gå direkte til din side.</p>
        <LinkButton href={AREA_HOME[me.role]} className="mt-3">
          Gå til min side
        </LinkButton>
      </Alert>
    );
  }

  const converting = me?.isAnonymous === true;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = converting
      ? convertSchema.safeParse(values)
      : signupSchema.safeParse({ role: "patient", ...values });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<PatientField>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      if (converting) {
        await apiRequest<AuthUserDto>("/api/auth/convert", { method: "POST", body: parsed.data });
      } else {
        await apiRequest<AuthUserDto>("/api/auth/signup", { method: "POST", body: parsed.data });
      }
      await refresh();
      if (onDone) {
        await onDone();
        return;
      }
      router.replace(AREA_HOME.patient);
      router.refresh();
    } catch (error) {
      setErrors({ fields: {}, general: apiErrorMessage(error) });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {converting ? (
        <Alert tone="info" title="Gem din samtale">
          Din samtale følger med til din nye konto. Du behøver ikke starte forfra.
        </Alert>
      ) : (
        <p className="text-base leading-relaxed text-ink-muted">
          Med en patientkonto kan du sende din sag til klinikker, booke en tid og følge dine aftaler.
        </p>
      )}
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}
      <TextField
        label="Fornavn"
        name="firstName"
        autoComplete="given-name"
        value={values.firstName}
        onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
        error={errors.fields.firstName}
        required
      />
      <TextField
        label="E-mail"
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
        label="Adgangskode"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mindst 8 tegn."
        value={values.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        error={errors.fields.password}
        required
      />
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Opretter konto …" : converting ? "Opret konto og gem samtalen" : "Opret patientkonto"}
      </Button>
    </form>
  );
}
