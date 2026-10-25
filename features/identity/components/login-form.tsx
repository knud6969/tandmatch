"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useSession } from "@/features/identity/components/session-provider";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/common/domain/field-errors";
import { AREA_HOME } from "@/lib/common/navigation/areas";
import { safeInternalPath } from "@/lib/common/navigation/paths";
import { loginSchema } from "@/lib/identity/schemas/auth";
import type { AuthUserDto } from "@/lib/identity/types/auth";

type LoginField = "email" | "password";

export function LoginForm({ naeste }: { naeste: string | null }) {
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
      <Link href="/glemt-adgangskode" className="-mt-2 self-start py-2 text-base font-semibold text-brand-700 underline underline-offset-4">
        Glemt adgangskode?
      </Link>
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Logger ind …" : "Log ind"}
      </Button>
      <p className="text-center text-base text-ink-muted">
        Ny klinik på TandMatch?{" "}
        <LinkButton href="/opret/klinik" variant="ghost" className="min-h-11 px-2">
          Opret klinik
        </LinkButton>
      </p>
    </form>
  );
}
