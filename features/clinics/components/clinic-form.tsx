"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { DeleteAccount } from "@/features/clinics/components/delete-account";
import { LoadState } from "@/components/ui/load-state";
import { LogoUpload } from "@/features/clinics/components/logo-upload";
import { SaveBar } from "@/components/ui/save-bar";
import { useLoad } from "@/platform/ui-utils/use-load";
import { VerificationBanner } from "@/features/clinics/components/verification-banner";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { loadClinic } from "@/features/clinics/utils/clinic-loaders";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/common/domain/field-errors";
import { useSaveState } from "@/features/clinics/utils/use-save-state";
import { CLINIC_DESCRIPTION_MAX_CHARS } from "@/lib/clinics/constants/clinics";
import { patchClinicSchema } from "@/lib/clinics/schemas/clinics";
import type { OwnClinicDto } from "@/lib/clinics/types/clinics";

type Values = {
  name: string;
  description: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  trustpilotUrl: string;
  trustpilotScore: string;
  trustpilotReviewCount: string;
};
type Field = keyof Values;

function toValues(clinic: OwnClinicDto): Values {
  return {
    name: clinic.name,
    description: clinic.description ?? "",
    address: clinic.address,
    postalCode: clinic.postalCode,
    city: clinic.city,
    phone: clinic.phone ?? "",
    email: clinic.email ?? "",
    website: clinic.website ?? "",
    trustpilotUrl: clinic.trustpilot?.url ?? "",
    trustpilotScore: clinic.trustpilot?.score != null ? String(clinic.trustpilot.score).replace(".", ",") : "",
    trustpilotReviewCount: clinic.trustpilot?.reviewCount != null ? String(clinic.trustpilot.reviewCount) : "",
  };
}

// Sider og felter for klinikkens profil (architecture 6.3, 10.8). Selve siden er en tynd skal om denne formular.
export function ClinicForm() {
  const { data, error, loading, reload } = useLoad(loadClinic);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <ProfileEditor initial={data} />;
}

function ProfileEditor({ initial }: { initial: OwnClinicDto }) {
  const [clinic, setClinic] = useState(initial);
  const [saved, setSaved] = useState(() => toValues(initial));
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const saveState = useSaveState(dirty);
  const set = (field: Field) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const score = values.trustpilotScore.trim() === "" ? null : Number(values.trustpilotScore.replace(",", "."));
    const count = values.trustpilotReviewCount.trim() === "" ? null : Number(values.trustpilotReviewCount.replace(/[\s.]/g, ""));
    const payload = {
      name: values.name,
      description: values.description,
      address: values.address,
      postalCode: values.postalCode,
      city: values.city,
      phone: values.phone.trim() === "" ? null : values.phone,
      email: values.email,
      website: values.website,
      trustpilotUrl: values.trustpilotUrl,
      trustpilotScore: score,
      trustpilotReviewCount: count,
    };
    const parsed = patchClinicSchema.safeParse(payload);
    const result: FieldErrors<Field> = parsed.success ? { fields: {}, general: null } : fieldErrorsFrom<Field>(parsed.error);
    if ((score !== null && Number.isNaN(score)) || (count !== null && Number.isNaN(count))) {
      if (score !== null && Number.isNaN(score)) result.fields.trustpilotScore = "Angiv scoren som et tal, fx 4,5.";
      if (count !== null && Number.isNaN(count)) result.fields.trustpilotReviewCount = "Angiv antal som et helt tal.";
    }
    setErrors(result);
    if (!parsed.success || Object.keys(result.fields).length > 0) {
      saveState.setError("Ret felterne markeret med rødt.");
      return;
    }
    await saveState.save(async () => {
      const next = await apiRequest<OwnClinicDto>("/api/clinics/me", { method: "PATCH", body: parsed.data });
      setClinic(next);
      const nextValues = toValues(next);
      setSaved(nextValues);
      setValues(nextValues);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <VerificationBanner status={clinic.status} />

      <Card>
        <LogoUpload logoUrl={clinic.logoUrl} onChange={(logoUrl) => setClinic((c) => ({ ...c, logoUrl }))} />
      </Card>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Card className="flex flex-col gap-5">
          <h2 className="text-xl font-semibold text-ink">Grunddata</h2>
          <TextField
            label="CVR-nummer"
            value={clinic.cvr}
            readOnly
            hint="CVR-nummeret kan ikke ændres. Kontakt os, hvis det er forkert."
          />
          <TextField label="Klinikkens navn" name="name" autoComplete="organization" value={values.name} onChange={set("name")} error={errors.fields.name} required />
          <TextField label="Adresse" name="address" autoComplete="street-address" value={values.address} onChange={set("address")} error={errors.fields.address} required />
          <div className="grid grid-cols-[7rem_1fr] gap-4">
            <TextField label="Postnummer" name="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={4} value={values.postalCode} onChange={set("postalCode")} error={errors.fields.postalCode} required />
            <TextField label="By" name="city" autoComplete="address-level2" value={values.city} onChange={set("city")} error={errors.fields.city} required />
          </div>
          <TextArea
            label="Beskrivelse"
            name="description"
            hint={`Fortæl kort, hvem klinikken er, og hvad klinikken er god til. ${values.description.length}/${CLINIC_DESCRIPTION_MAX_CHARS} tegn.`}
            maxLength={CLINIC_DESCRIPTION_MAX_CHARS}
            value={values.description}
            onChange={set("description")}
            error={errors.fields.description}
          />
        </Card>

        <Card className="flex flex-col gap-5">
          <h2 className="text-xl font-semibold text-ink">Kontakt</h2>
          <p className="-mt-2 text-base text-ink-muted">Vises offentligt på klinikkens profil.</p>
          <TextField label="Telefon" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} error={errors.fields.phone} />
          <TextField label="E-mail" name="email" type="email" inputMode="email" autoComplete="email" value={values.email} onChange={set("email")} error={errors.fields.email} />
          <TextField label="Hjemmeside" name="website" type="url" inputMode="url" placeholder="https://" value={values.website} onChange={set("website")} error={errors.fields.website} />
        </Card>

        <Card className="flex flex-col gap-5">
          <h2 className="text-xl font-semibold text-ink">Trustpilot</h2>
          <Alert tone="info">
            Vi henter ikke noget fra Trustpilot. Du angiver selv linket, scoren og antallet af anmeldelser, og vi viser
            dem på profilen som “angivet af klinikken” med link til din Trustpilot-side.
          </Alert>
          <TextField label="Link til din Trustpilot-side" name="trustpilotUrl" type="url" inputMode="url" placeholder="https://dk.trustpilot.com/review/…" value={values.trustpilotUrl} onChange={set("trustpilotUrl")} error={errors.fields.trustpilotUrl} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Score (1,0-5,0)" name="trustpilotScore" inputMode="decimal" value={values.trustpilotScore} onChange={set("trustpilotScore")} error={errors.fields.trustpilotScore} />
            <TextField label="Antal anmeldelser" name="trustpilotReviewCount" inputMode="numeric" value={values.trustpilotReviewCount} onChange={set("trustpilotReviewCount")} error={errors.fields.trustpilotReviewCount} />
          </div>
        </Card>

        <SaveBar {...saveState.props} label="Gem profil" />
      </form>

      <DeleteAccount clinicName={clinic.name} />
    </div>
  );
}
