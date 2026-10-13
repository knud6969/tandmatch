"use client";

import { useRef, type ChangeEvent } from "react";
import { Button } from "@/views/components/ui/button";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { IMAGE_ACCEPT } from "@/views/utils/prepare-image";
import { uploadImage } from "@/views/utils/upload-image";
import { useAction } from "@/views/utils/use-action";

type LogoUploadProps = {
  logoUrl: string | null;
  onChange: (logoUrl: string | null) => void;
};

// Logoet gemmes straks ved upload (ikke sammen med resten af profilen). Billedet nedskaleres i browseren først.
export function LogoUpload({ logoUrl, onChange }: LogoUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, message, run } = useAction();

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      const result = await uploadImage<{ logoUrl: string }>("/api/clinics/me/logo", file, { maxDimension: 1024 });
      onChange(result.logoUrl);
      return "Logoet er gemt.";
    });
  }

  const remove = () =>
    run(async () => {
      await apiRequest<void>("/api/clinics/me/logo", { method: "DELETE" });
      onChange(null);
      return "Logoet er fjernet.";
    });

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
      <StatusMessage message={message} />
    </div>
  );
}
