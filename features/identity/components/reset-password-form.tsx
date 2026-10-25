"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { RECOVERY_INVALID_TEXT } from "@/lib/common/constants/error-texts";
import { resetPasswordSchema } from "@/lib/identity/schemas/auth";

// Koden fra linket: `code` (PKCE) eller `tokenHash`. `invalid` er sat, når Supabase sendte en fejl tilbage i stedet.
export type RecoveryLink = { code?: string; tokenHash?: string; invalid?: boolean };

type Step = "checking" | "ready" | "invalid";

// Ny adgangskode efter et link fra e-mailen (architecture 10.2). Koden byttes til en recovery-session én gang og fjernes
// straks fra adresselinjen, så den ikke ligger i historikken.
export function ResetPasswordForm({ link }: { link: RecoveryLink }) {
  const hasCode = Boolean(link.code || link.tokenHash);
  const [step, setStep] = useState<Step>(link.invalid ? "invalid" : hasCode ? "checking" : "ready");
  const [values, setValues] = useState({ password: "", repeat: "" });
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; repeat?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (link.invalid || !hasCode || started.current) return;
    started.current = true;
    window.history.replaceState(null, "", "/nulstil-adgangskode");
    const body = link.code ? { code: link.code } : { tokenHash: link.tokenHash };
    apiRequest<{ ok: true }>("/api/auth/password/recovery", { method: "POST", body })
      .then(() => setStep("ready"))
      .catch((e) => {
        setError(apiErrorMessage(e));
        setStep("invalid");
      });
  }, [hasCode, link.code, link.tokenHash, link.invalid]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password: values.password });
    if (!parsed.success) {
      setFieldErrors({ password: parsed.error.issues[0]?.message });
      return;
    }
    if (values.repeat !== values.password) {
      setFieldErrors({ repeat: "De to adgangskoder er ikke ens." });
      return;
    }
    setFieldErrors({});
    setError(null);
    setPending(true);
    try {
      await apiRequest<void>("/api/auth/password/reset", { method: "POST", body: parsed.data });
      // Hård navigation: alle sessioner er logget ud, og /login kan ligge bag vilkårs-gaten (se terms-accept-form.tsx).
      window.location.replace("/login?besked=adgangskode-nulstillet");
    } catch (e) {
      setError(apiErrorMessage(e));
      setPending(false);
    }
  }

  if (step === "checking") {
    return <p role="status" className="text-base text-ink-muted">Tjekker linket …</p>;
  }

  if (step === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger" role="alert">
          {error ?? RECOVERY_INVALID_TEXT}
        </Alert>
        <LinkButton href="/glemt-adgangskode" className="self-start">
          Bed om et nyt link
        </LinkButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && (
        <Alert tone="danger" role="alert">
          {error}{" "}
          <LinkButton href="/glemt-adgangskode" variant="ghost" className="min-h-11 px-2">
            Bed om et nyt link
          </LinkButton>
        </Alert>
      )}
      <TextField
        label="Ny adgangskode"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mindst 8 tegn."
        value={values.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        error={fieldErrors.password}
        required
      />
      <TextField
        label="Gentag ny adgangskode"
        name="repeat"
        type="password"
        autoComplete="new-password"
        value={values.repeat}
        onChange={(e) => setValues((v) => ({ ...v, repeat: e.target.value }))}
        error={fieldErrors.repeat}
        required
      />
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Gemmer …" : "Gem ny adgangskode"}
      </Button>
    </form>
  );
}
