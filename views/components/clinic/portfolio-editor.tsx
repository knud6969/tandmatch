"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { SelectField } from "@/views/components/ui/select-field";
import { StatusMessage } from "@/views/components/ui/status-message";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { IMAGE_ACCEPT } from "@/views/utils/prepare-image";
import { uploadImage } from "@/views/utils/upload-image";
import { useAction } from "@/views/utils/use-action";
import { PORTFOLIO_CAPTION_MAX_CHARS } from "@/lib/constants/clinics";
import { PORTFOLIO_CONSENT_TEXT, PORTFOLIO_CONSENT_TEXT_VERSION } from "@/lib/constants/consents";
import type { PortfolioItemDto } from "@/lib/types/clinics";
import type { ServiceDto } from "@/lib/types/services";

type PortfolioEditorProps = {
  dentistId: string;
  dentistName: string;
  items: PortfolioItemDto[];
  services: ServiceDto[];
  onChange: (items: PortfolioItemDto[]) => void;
};

// Portefølje for én tandlæge. Et billede kan kun uploades, når klinikken bekræfter, at patienten har givet samtykke
// til offentliggørelse (architecture 9.5). Teksten er konstanten fra lib/constants/consents.ts.
export function PortfolioEditor({ dentistId, dentistName, items, services, onChange }: PortfolioEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { busy, message, run, fail } = useAction();

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return fail("Vælg et billede først.");
    if (!consent) return fail("Bekræft patientens samtykke, før billedet uploades.");
    await run(async () => {
      const created = await uploadImage<PortfolioItemDto>("/api/clinics/me/portfolio", file, {
        fields: {
          dentistId,
          serviceId,
          caption,
          patientConsentConfirmed: "true",
          consentTextVersion: PORTFOLIO_CONSENT_TEXT_VERSION,
        },
      });
      onChange([...items, created]);
      setFile(null);
      setCaption("");
      setServiceId("");
      setConsent(false);
      if (fileInput.current) fileInput.current.value = "";
      return "Billedet er uploadet og vises nu på profilen, når klinikken er verificeret.";
    });
  }

  const onDelete = (id: string) =>
    run(async () => {
      await apiRequest<void>(`/api/clinics/me/portfolio/${id}`, { method: "DELETE" });
      onChange(items.filter((item) => item.id !== id));
      return "Billedet er slettet.";
    });

  const onEdit = (id: string, values: { caption: string; serviceId: string }) =>
    run(async () => {
      const updated = await apiRequest<PortfolioItemDto>(`/api/clinics/me/portfolio/${id}`, {
        method: "PATCH",
        body: { caption: values.caption.trim() === "" ? null : values.caption.trim(), serviceId: values.serviceId || null },
      });
      onChange(items.map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
      return "Billedet er opdateret.";
    });

  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-ink">Portefølje ({items.length})</h4>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="col-span-full">
                <EditItem
                  item={item}
                  services={services}
                  busy={busy}
                  onSave={(values) => onEdit(item.id, values)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={item.id} className="flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen. */}
                <img src={item.imageUrl} alt={item.caption ?? "Porteføljebillede"} className="aspect-square w-full object-cover" />
                <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                  <p className="text-sm text-ink">{item.caption ?? item.serviceName ?? "Uden billedtekst"}</p>
                  {item.caption && item.serviceName && <p className="text-sm text-ink-muted">{item.serviceName}</p>}
                  <div className="mt-auto flex flex-col gap-2">
                    <Button variant="secondary" className="min-h-11 px-3" disabled={busy} onClick={() => setEditingId(item.id)}>
                      Redigér<span className="sr-only"> billedet: {item.caption ?? "uden billedtekst"}</span>
                    </Button>
                    <Button variant="danger-outline" className="min-h-11 px-3" disabled={busy} onClick={() => onDelete(item.id)}>
                      <span className="sr-only">Slet billedet: {item.caption ?? "uden billedtekst"}. </span>Slet
                    </Button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={onUpload} noValidate className="flex flex-col gap-4 rounded-card border border-line bg-surface-muted p-4">
        <h5 className="text-base font-semibold text-ink">Tilføj billede af {dentistName}s arbejde</h5>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`portfolio-file-${dentistId}`} className="text-sm font-semibold text-ink">
            Billede (JPEG eller PNG)
          </label>
          <input
            ref={fileInput}
            id={`portfolio-file-${dentistId}`}
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-h-12 w-full rounded-control border border-field-border bg-surface px-3 py-2.5 text-base text-ink file:mr-3 file:rounded-control file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-800"
          />
        </div>
        <ServiceSelect services={services} value={serviceId} onChange={setServiceId} />
        <TextField
          label="Billedtekst (valgfri)"
          hint="Ingen navne eller andre personoplysninger."
          maxLength={PORTFOLIO_CAPTION_MAX_CHARS}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <CheckboxField label={PORTFOLIO_CONSENT_TEXT} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <StatusMessage message={message} />
        <Button type="submit" disabled={busy || !file || !consent} className="sm:self-start">
          {busy ? "Arbejder …" : "Upload billede"}
        </Button>
      </form>
    </div>
  );
}

function ServiceSelect({ services, value, onChange }: { services: ServiceDto[]; value: string; onChange: (id: string) => void }) {
  return (
    <SelectField label="Behandling (valgfri)" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Ikke angivet</option>
      {services.map((service) => (
        <option key={service.id} value={service.id}>
          {service.name}
        </option>
      ))}
    </SelectField>
  );
}

type EditItemProps = {
  item: PortfolioItemDto;
  services: ServiceDto[];
  busy: boolean;
  onSave: (values: { caption: string; serviceId: string }) => void;
  onCancel: () => void;
};

// Redigér billedtekst og behandling på et eksisterende porteføljebillede (billedet og samtykket ændres ikke).
function EditItem({ item, services, busy, onSave, onCancel }: EditItemProps) {
  const [caption, setCaption] = useState(item.caption ?? "");
  const [serviceId, setServiceId] = useState(item.serviceId ?? "");
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ caption, serviceId });
      }}
      className="flex flex-col gap-4 rounded-card border border-brand-300 bg-surface p-4 sm:flex-row"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen. */}
      <img src={item.imageUrl} alt="" className="size-24 shrink-0 rounded-control object-cover" />
      <div className="flex flex-1 flex-col gap-4">
        <TextField
          label="Billedtekst"
          hint="Ingen navne eller andre personoplysninger."
          maxLength={PORTFOLIO_CAPTION_MAX_CHARS}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <ServiceSelect services={services} value={serviceId} onChange={setServiceId} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={busy}>
            {busy ? "Gemmer …" : "Gem ændringer"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Annuller
          </Button>
        </div>
      </div>
    </form>
  );
}
