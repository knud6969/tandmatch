"use client";

import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { SelectField } from "@/views/components/ui/select-field";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { IMAGE_ACCEPT, ImagePrepareError, prepareImage } from "@/views/utils/prepare-image";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage({ tone: "danger", text: "Vælg et billede først." });
      return;
    }
    if (!consent) {
      setMessage({ tone: "danger", text: "Bekræft patientens samtykke, før billedet uploades." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const prepared = await prepareImage(file);
      const form = new FormData();
      form.set("file", prepared);
      form.set("dentistId", dentistId);
      form.set("serviceId", serviceId);
      form.set("caption", caption);
      form.set("patientConsentConfirmed", "true");
      form.set("consentTextVersion", PORTFOLIO_CONSENT_TEXT_VERSION);
      const created = await apiRequest<PortfolioItemDto>("/api/clinics/me/portfolio", { method: "POST", form });
      onChange([...items, created]);
      setFile(null);
      setCaption("");
      setServiceId("");
      setConsent(false);
      if (fileInput.current) fileInput.current.value = "";
      setMessage({ tone: "success", text: "Billedet er uploadet og vises nu på profilen, når klinikken er verificeret." });
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof ImagePrepareError ? e.message : apiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest<void>(`/api/clinics/me/portfolio/${id}`, { method: "DELETE" });
      onChange(items.filter((item) => item.id !== id));
      setMessage({ tone: "success", text: "Billedet er slettet." });
    } catch (e) {
      setMessage({ tone: "danger", text: apiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-ink">Portefølje ({items.length})</h4>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen. */}
              <img src={item.imageUrl} alt={item.caption ?? "Porteføljebillede"} className="aspect-square w-full object-cover" />
              <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                <p className="text-sm text-ink">{item.caption ?? item.serviceName ?? "Uden billedtekst"}</p>
                {item.caption && item.serviceName && <p className="text-sm text-ink-muted">{item.serviceName}</p>}
                <Button variant="danger-outline" className="mt-auto min-h-11 px-3" disabled={busy} onClick={() => onDelete(item.id)}>
                  <span className="sr-only">Slet billedet: {item.caption ?? "uden billedtekst"}. </span>Slet
                </Button>
              </div>
            </li>
          ))}
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
        <SelectField label="Behandling (valgfri)" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">Ikke angivet</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Billedtekst (valgfri)"
          hint="Ingen navne eller andre personoplysninger."
          maxLength={PORTFOLIO_CAPTION_MAX_CHARS}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <CheckboxField label={PORTFOLIO_CONSENT_TEXT} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {message && (
          <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
            {message.text}
          </Alert>
        )}
        <Button type="submit" disabled={busy || !file || !consent} className="sm:self-start">
          {busy ? "Arbejder …" : "Upload billede"}
        </Button>
      </form>
    </div>
  );
}
