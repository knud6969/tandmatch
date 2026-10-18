"use client";

import { useState, type FormEvent } from "react";
import { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/ui/load-state";
import { SaveBar } from "@/views/components/ui/save-bar";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { useLoad } from "@/views/utils/use-load";
import { useSaveState } from "@/views/utils/use-save-state";

type Values = { firstName: string; postalCode: string; phone: string };
type Field = keyof Values;

const loadProfile = () => apiRequest<PatientMeDto>("/api/patients/me");

const toValues = (me: PatientMeDto): Values => ({
  firstName: me.firstName ?? "",
  postalCode: me.postalCode ?? "",
  phone: me.phone ?? "",
});

// Patientens profil (architecture 6.2, 10.2): fornavn, postnummer og telefon. Tomt telefonfelt rydder nummeret.
export function ProfileForm() {
  const { data, loading, error, reload } = useLoad(loadProfile);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <ProfileEditor initial={data} />;
}

function ProfileEditor({ initial }: { initial: PatientMeDto }) {
  const [saved, setSaved] = useState(() => toValues(initial));
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const saveState = useSaveState(dirty);
  const set = (field: Field) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      firstName: values.firstName.trim(),
      postalCode: values.postalCode.trim(),
      phone: values.phone.trim() === "" ? null : values.phone,
    };
    // Postnummer er valgfrit i visningen: et tomt felt sendes ikke, så et gemt postnummer ikke overskrives med en fejl.
    const parsed = patchPatientSchema.safeParse({ ...payload, postalCode: payload.postalCode === "" ? undefined : payload.postalCode });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<Field>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    await saveState.save(async () => {
      const result = await apiRequest<PatientMeDto>("/api/patients/me", { method: "PATCH", body: parsed.data });
      const next = toValues(result);
      setSaved(next);
      setValues(next);
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-labelledby="profil-titel">
        <h2 id="profil-titel" className="text-xl font-semibold text-ink">
          Dine oplysninger
        </h2>
        <TextField label="Fornavn" name="firstName" autoComplete="given-name" value={values.firstName} onChange={set("firstName")} error={errors.fields.firstName} />
        <TextField
          label="Postnummer"
          name="postalCode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={4}
          hint="Bruges til at vise afstand til klinikkerne."
          value={values.postalCode}
          onChange={set("postalCode")}
          error={errors.fields.postalCode}
        />
        <TextField
          label="Telefon"
          name="phone"
          type="tel"
          autoComplete="tel"
          hint="Valgfri. Forudfyldes, når du booker. Klinikken ser først dit nummer, når en tid er booket."
          value={values.phone}
          onChange={set("phone")}
          error={errors.fields.phone}
        />
        <SaveBar {...saveState.props} sticky={false} />
      </form>
    </Card>
  );
}
