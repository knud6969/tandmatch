"use client";

import { useState, type FormEvent } from "react";
import { EMERGENCY_DESCRIPTION_MAX } from "@/lib/constants/leads";
import { emergencyLeadSchema } from "@/lib/schemas/leads";
import type { EmergencyLeadCreatedDto } from "@/lib/types/leads";
import type { PatientMeDto } from "@/lib/types/patients";
import { PriceWithSource } from "@/views/components/ui/price-with-source";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { StatusMessage } from "@/views/components/ui/status-message";
import { TextArea } from "@/views/components/ui/text-area";
import { TextField } from "@/views/components/ui/text-field";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { isPostalCode } from "@/views/utils/clinic-query";
import { formatDateTime } from "@/views/utils/format";
import { useAction } from "@/views/utils/use-action";
import type { EmergencyChoice } from "@/views/components/emergency/emergency-clinic-step";

// Det patienten har skrevet. Ligger i EmergencyFlow, så det bevares, hvis tiden skal vælges om.
export type EmergencyDetails = { description: string; name: string | null; phone: string | null };

type Field = "description" | "contactName" | "contactPhone";

type Props = {
  choice: EmergencyChoice;
  postalCode: string;
  profile: PatientMeDto | null;
  details: EmergencyDetails;
  onDetails: (patch: Partial<EmergencyDetails>) => void;
  onSent: (created: EmergencyLeadCreatedDto) => void;
  // Tiden er væk: tilbage til valg af tid, beskrivelsen bevares.
  onSlotLost: () => void;
  onChangeChoice: () => void;
};

// Trin 3: kort beskrivelse, navn og telefon, oversigt og "Send og reservér tiden" (architecture 6.1, 10.11).
export function EmergencySendStep({ choice, postalCode, profile, details, onDetails, onSent, onSlotLost, onChangeChoice }: Props) {
  const action = useAction();
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const name = details.name ?? profile?.firstName ?? "";
  const phone = details.phone ?? profile?.phone ?? "";
  const price = choice.clinic.prices.find((p) => p.serviceId === choice.service.id)?.price ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = emergencyLeadSchema.safeParse({
      clinicId: choice.clinic.id,
      serviceId: choice.service.id,
      startsAt: choice.slot.startsAt,
      description: details.description,
      contactName: name,
      contactPhone: phone.trim(),
      ...(isPostalCode(postalCode) ? { postalCode } : {}),
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<Field>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    let created: EmergencyLeadCreatedDto | null = null;
    const ok = await action.run(async () => {
      try {
        created = await apiRequest<EmergencyLeadCreatedDto>("/api/emergency-leads", { method: "POST", body: parsed.data });
      } catch (e) {
        if (e instanceof ApiRequestError && (e.code === "SLOT_TAKEN" || e.code === "SLOT_UNAVAILABLE")) onSlotLost();
        throw e;
      }
    });
    if (ok && created) onSent(created);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label="Akut henvendelse" data-testid="akut-send">
      <dl className="flex flex-col gap-1 rounded-card border border-brand-200 bg-brand-50 p-4 text-base" data-testid="akut-oversigt">
        <div>
          <dt className="sr-only">Klinik</dt>
          <dd className="font-semibold text-ink">{choice.clinic.name}</dd>
        </div>
        <div>
          <dt className="sr-only">Adresse</dt>
          <dd className="text-sm text-ink-muted">
            {choice.clinic.address}, {choice.clinic.postalCode} {choice.clinic.city}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Behandling</dt>
          <dd className="text-ink">
            {choice.service.name}
            {price && (
              <>
                {" "}
                · <PriceWithSource price={price} />
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Tid</dt>
          <dd className="font-semibold text-ink">{formatDateTime(choice.slot.startsAt)}</dd>
        </div>
      </dl>
      <div>
        <Button variant="secondary" onClick={onChangeChoice}>
          Skift klinik eller tid
        </Button>
      </div>

      <TextArea
        label="Hvad er der galt?"
        hint="Skriv kort, hvad der er galt. Skriv ikke dit cpr-nummer."
        rows={5}
        maxLength={EMERGENCY_DESCRIPTION_MAX}
        value={details.description}
        onChange={(event) => onDetails({ description: event.target.value })}
        error={errors.fields.description}
        required
      />
      <TextField
        label="Fulde navn"
        name="contactName"
        autoComplete="name"
        value={name}
        onChange={(event) => onDetails({ name: event.target.value })}
        error={errors.fields.contactName}
        required
      />
      <TextField
        label="Telefon"
        name="contactPhone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(event) => onDetails({ phone: event.target.value })}
        error={errors.fields.contactPhone}
        required
      />

      <Alert tone="info">
        <p>
          Tiden reserveres til dig med det samme, mens klinikken svarer. Klinikken ser først dit navn og dit telefonnummer, når den har
          accepteret. Klinikken laver den endelige vurdering. Her er ingen AI, og vi giver ingen vurdering af dit problem.
        </p>
      </Alert>
      <StatusMessage message={action.message} />
      <Button type="submit" fullWidth disabled={action.busy}>
        {action.busy ? "Sender …" : "Send og reservér tiden"}
      </Button>
    </form>
  );
}
