"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useSession } from "@/views/components/session/session-provider";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/platform/ui-utils/field-errors";
import { AREA_HOME } from "@/lib/common/navigation/areas";
import { safeInternalPath } from "@/lib/common/navigation/paths";
import { loginSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";

type LoginField = "email" | "password";

type LoginFormProps = {
  naeste: string | null;
  // Med onDone bliver brugeren på siden (fx /akut) i stedet for at blive sendt til sin forside.
  onDone?: () => void | Promise<void>;
};

export function LoginForm({ naeste, onDone }: LoginFormProps) {
  const router = useRouter();
  const { refresh } = useSession();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<LoginField>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      const user = await apiRequest<AuthUserDto>("/api/auth/login", { method: "POST", body: parsed.data });
      await refresh();
      if (onDone) {
        await onDone();
        return;
      }
      router.replace(safeInternalPath(naeste ?? undefined) ?? (user.role === "clinic" ? AREA_HOME.clinic : "/"));
      router.refresh();
    } catch (error) {
      setErrors({ fields: {}, general: apiErrorMessage(error) });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}
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
        autoComplete="current-password"
        value={values.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        error={errors.fields.password}
        required
      />
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Logger ind …" : "Log ind"}
      </Button>
      {!onDone && (
        <p className="text-center text-base text-ink-muted">
          Har du ikke en konto endnu?{" "}
          <LinkButton href="/opret" variant="ghost" className="min-h-11 px-2">
            Opret konto
          </LinkButton>
        </p>
      )}
    </form>
  );
}
