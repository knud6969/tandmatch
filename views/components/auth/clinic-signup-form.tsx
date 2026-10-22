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
import { signupSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";

type ClinicField = "clinicName" | "cvr" | "address" | "postalCode" | "city" | "phone" | "email" | "password";

const EMPTY = { clinicName: "", cvr: "", address: "", postalCode: "", city: "", phone: "", email: "", password: "" };

// Opretter en klinikkonto (architecture 10.2). Klinikken starter som "afventer verificering" og kan sætte alt op med det samme.
export function ClinicSignupForm() {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<ClinicField>>({ fields: {}, general: null });
  const [pending, setPending] = useState(false);

  if (state.status === "loading") {
    return <p role="status" className="text-base text-ink-muted">Indlæser …</p>;
  }

  const me = state.status === "ready" ? state.me : null;
  if (me && !me.isAnonymous) {
    return (
      <Alert tone="info" title="Du er allerede logget ind">
        <p>Log ud for at oprette en ny klinik, eller gå direkte til din side.</p>
        <LinkButton href={AREA_HOME[me.role]} className="mt-3">
          Gå til min side
        </LinkButton>
      </Alert>
    );
  }
  if (me?.isAnonymous) {
    return (
      <Alert tone="warning" title="Du har en anonym samtale i gang">
        <p>
          Klinikker kan ikke oprettes fra en anonym patientsamtale. Log ud eller åbn siden i et privat browservindue, og
          prøv igen.
        </p>
      </Alert>
    );
  }

  const set = (field: ClinicField) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({ role: "clinic", ...values });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<ClinicField>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      await apiRequest<AuthUserDto>("/api/auth/signup", { method: "POST", body: parsed.data });
      await refresh();
      router.replace(AREA_HOME.clinic);
      router.refresh();
    } catch (error) {
      setErrors({ fields: {}, general: apiErrorMessage(error) });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-base leading-relaxed text-ink-muted">
        Du kan sætte profil, prisliste, åbningstider og tandlæger op med det samme. TandMatch verificerer klinikken,
        før patienter kan sende henvendelser.
      </p>
      {errors.general && (
        <Alert tone="danger" role="alert">
          {errors.general}
        </Alert>
      )}
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-1 text-lg font-semibold text-ink">Klinikken</legend>
        <TextField label="Klinikkens navn" name="clinicName" autoComplete="organization" value={values.clinicName} onChange={set("clinicName")} error={errors.fields.clinicName} required />
        <TextField label="CVR-nummer" name="cvr" inputMode="numeric" maxLength={8} autoComplete="off" hint="8 cifre. Vi slår det ikke op automatisk." value={values.cvr} onChange={set("cvr")} error={errors.fields.cvr} required />
        <TextField label="Adresse" name="address" autoComplete="street-address" value={values.address} onChange={set("address")} error={errors.fields.address} required />
        <div className="grid grid-cols-[7rem_1fr] gap-4">
          <TextField label="Postnummer" name="postalCode" inputMode="numeric" maxLength={4} autoComplete="postal-code" value={values.postalCode} onChange={set("postalCode")} error={errors.fields.postalCode} required />
          <TextField label="By" name="city" autoComplete="address-level2" value={values.city} onChange={set("city")} error={errors.fields.city} required />
        </div>
        <TextField label="Telefon" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} error={errors.fields.phone} required />
      </fieldset>
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-1 text-lg font-semibold text-ink">Dit login</legend>
        <TextField label="E-mail" name="email" type="email" inputMode="email" autoComplete="email" value={values.email} onChange={set("email")} error={errors.fields.email} required />
        <TextField label="Adgangskode" name="password" type="password" autoComplete="new-password" hint="Mindst 8 tegn." value={values.password} onChange={set("password")} error={errors.fields.password} required />
      </fieldset>
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Opretter klinik …" : "Opret klinik"}
      </Button>
    </form>
  );
}
