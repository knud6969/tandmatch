"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { IMAGE_ACCEPT, ImagePrepareError, prepareImage } from "@/views/utils/prepare-image";

type LogoUploadProps = {
  logoUrl: string | null;
  onChange: (logoUrl: string | null) => void;
};

// Logoet gemmes straks ved upload (ikke sammen med resten af profilen). Billedet nedskaleres i browseren først.
export function LogoUpload({ logoUrl, onChange }: LogoUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const prepared = await prepareImage(file, 1024);
      const form = new FormData();
      form.set("file", prepared);
      const result = await apiRequest<{ logoUrl: string }>("/api/clinics/me/logo", { method: "POST", form });
      onChange(result.logoUrl);
      setMessage({ tone: "success", text: "Logoet er gemt." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ImagePrepareError ? error.message : apiErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest<void>("/api/clinics/me/logo", { method: "DELETE" });
      onChange(null);
      setMessage({ tone: "success", text: "Logoet er fjernet." });
    } catch (error) {
      setMessage({ tone: "danger", text: apiErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-ink">Logo</h2>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-surface-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen.
            <img src={logoUrl} alt="Klinikkens logo" className="size-full object-contain" />
          ) : (
            <span className="px-2 text-center text-sm text-ink-muted">Intet logo endnu</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <input ref={input} type="file" accept={IMAGE_ACCEPT} onChange={onFile} className="sr-only" aria-label="Vælg logofil" tabIndex={-1} />
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Arbejder …" : logoUrl ? "Skift logo" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button variant="ghost" disabled={busy} onClick={remove}>
              Fjern logo
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-ink-muted">JPEG eller PNG. Billedet gøres automatisk mindre, og skjulte data som placering fjernes.</p>
      {message && (
        <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </Alert>
      )}
    </div>
  );
}
