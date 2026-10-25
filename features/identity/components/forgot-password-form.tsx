"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { forgotPasswordSchema } from "@/lib/identity/schemas/auth";

// Glemt adgangskode (architecture 10.2). Kvitteringen er den samme, uanset om e-mailen har en konto.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setError(null);
    setPending(true);
    try {
      await apiRequest<{ sent: true }>("/api/auth/password/forgot", { method: "POST", body: parsed.data });
      setSent(true);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Tjek din e-mail">
          Hvis der findes en konto med den e-mail, har vi sendt et link til at vælge en ny adgangskode. Linket virker i 1
          time. Kan du ikke finde det, så kig i spam.
        </Alert>
        <LinkButton href="/login" variant="secondary" className="self-start">
          Tilbage til log ind
        </LinkButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <TextField
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError}
        required
      />
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Sender …" : "Send link"}
      </Button>
      <LinkButton href="/login" variant="ghost" className="min-h-11 self-center px-2">
        Tilbage til log ind
      </LinkButton>
    </form>
  );
}
