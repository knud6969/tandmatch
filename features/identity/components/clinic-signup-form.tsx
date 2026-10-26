"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useSession } from "@/features/identity/components/session-provider";
import { TermsDialog } from "@/features/identity/components/terms-dialog";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/common/domain/field-errors";
import { AREA_HOME } from "@/lib/common/navigation/areas";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/identity/constants/legal";
import { signupSchema } from "@/lib/identity/schemas/auth";
import type { AuthUserDto, TermsAcceptedDto } from "@/lib/identity/types/auth";

type ClinicField = "clinicName" | "cvr" | "address" | "postalCode" | "city" | "phone" | "email" | "password" | "terms";

const TERMS_REQUIRED_TEXT = "Du skal acceptere vilkårene for at oprette klinikken.";

const EMPTY = { clinicName: "", cvr: "", address: "", postalCode: "", city: "", phone: "", email: "", password: "" };

// Opretter en klinikkonto (architecture 10.2). [PROTOTYPE] Klinikken verificeres automatisk ved oprettelse (docs/beslutninger.md) og kan sætte alt op med det samme.
// Siden er undtaget fra vilkårs-gaten; accepten indhentes her i vilkårs-dialogen (læst til bunden, ikke forudvalgt) og gemmes
// før signup (identity 2.5). legalText er vilkår og privatlivspolitik, renderet på serveren af siden.
export function ClinicSignupForm({ legalText }: { legalText: ReactNode }) {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
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

  const set = (field: ClinicField) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({ role: "clinic", ...values });
    if (!parsed.success || !termsAccepted) {
      const next = parsed.success ? { fields: {}, general: null } : fieldErrorsFrom<ClinicField>(parsed.error);
      setErrors(termsAccepted ? next : { ...next, fields: { ...next.fields, terms: TERMS_REQUIRED_TEXT } });
      return;
    }
    setErrors({ fields: {}, general: null });
    setPending(true);
    try {
      await apiRequest<TermsAcceptedDto>("/api/terms/accept", {
        method: "POST",
        body: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
      });
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
      <div className="flex flex-col gap-1.5">
        {termsAccepted ? (
          <div className="flex min-h-12 items-start gap-3 rounded-control border border-brand-500 bg-brand-50 p-4 text-base">
            <span aria-hidden="true" className="font-semibold text-brand-700">✓</span>
            <p className="flex-1">
              Du har accepteret brugervilkårene og læst privatlivspolitikken.{" "}
              <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-brand-700 underline underline-offset-4">
                Læs igen
              </button>
            </p>
          </div>
        ) : (
          <Button variant="secondary" fullWidth onClick={() => setTermsOpen(true)} aria-describedby={errors.fields.terms ? "terms-error" : undefined}>
            Læs og accepter vilkårene
          </Button>
        )}
        {errors.fields.terms && (
          <p id="terms-error" className="text-sm font-medium text-danger-ink">
            {errors.fields.terms}
          </p>
        )}
      </div>
      <TermsDialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAccept={() => {
          setTermsAccepted(true);
          setTermsOpen(false);
          setErrors((e) => ({ ...e, fields: { ...e.fields, terms: undefined } }));
        }}
        acceptLabel="Jeg accepterer vilkårene"
      >
        {legalText}
      </TermsDialog>
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Opretter klinik …" : "Opret klinik"}
      </Button>
      <p className="text-center text-base text-ink-muted">
        Har du allerede en konto?{" "}
        <LinkButton href="/login" variant="ghost" className="min-h-11 px-2">
          Log ind
        </LinkButton>
      </p>
    </form>
  );
}
