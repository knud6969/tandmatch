"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useSession } from "@/components/session/session-provider";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/forms/field-errors";
import { AREA_HOME } from "@/lib/navigation/areas";
import { signupSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";

type DentistField = "fullName" | "authorizationId" | "email" | "password";

// Opretter en tandlægeprofil. Profilen er altid ikke verificeret ved oprettelse (architecture 3, 4.3).
export function DentistSignupForm() {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [values, setValues] = useState({ fullName: "", authorizationId: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<DentistField>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);

  if (state.status === "loading") {
    return <p role="status" className="text-base text-ink-muted">Indlæser …</p>;
  }

  const me = state.status === "ready" ? state.me : null;
  if (me) {
    return (
      <Alert tone="info" title="Du er allerede logget ind">
        <p>Log ud først, hvis du vil oprette en ny tandlægeprofil.</p>
        <LinkButton href={AREA_HOME[me.role]} className="mt-3">
          Gå til min side
        </LinkButton>
      </Alert>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({ role: "dentist", ...values });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<DentistField>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      await apiRequest<AuthUserDto>("/api/auth/signup", { method: "POST", body: parsed.data });
      await refresh();
      router.replace(AREA_HOME.dentist);
      router.refresh();
    } catch (error) {
      setErrors({ fields: {}, general: apiErrorMessage(error) });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Alert tone="warning" title="Din profil er ikke verificeret endnu">
        <p>
          Vi kontrollerer din autorisation, før du kan modtage forespørgsler. Indtil da vises din indbakke som
          &quot;Afventer verifikation&quot;.
        </p>
      </Alert>
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}
      <TextField
        label="Fulde navn"
        name="fullName"
        autoComplete="name"
        hint="Vises på din offentlige profil."
        value={values.fullName}
        onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
        error={errors.fields.fullName}
        required
      />
      <TextField
        label="Autorisations-ID"
        name="authorizationId"
        autoComplete="off"
        hint="Det autorisationsnummer, du har fra Styrelsen for Patientsikkerhed. Bruges til verifikation."
        value={values.authorizationId}
        onChange={(e) => setValues((v) => ({ ...v, authorizationId: e.target.value }))}
        error={errors.fields.authorizationId}
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
        {pending ? "Opretter profil …" : "Opret tandlægeprofil"}
      </Button>
    </form>
  );
}
