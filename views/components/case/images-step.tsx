"use client";

/* eslint-disable @next/next/no-img-element -- signerede billed-URL'er fra Supabase Storage, ikke statiske billeder */
import { useRef } from "react";
import { IMAGE_QUALITY_LABELS, DESCRIPTION_LABEL } from "@/lib/constants/ai-texts";
import { MAX_IMAGES_PER_CASE } from "@/lib/constants/limits";
import type { ImageQuality } from "@/lib/types/ai";
import type { CaseDto } from "@/lib/types/cases";
import { ConsentGate } from "@/views/components/case/consent-gate";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { IMAGE_ACCEPT } from "@/views/utils/prepare-image";
import { uploadImage } from "@/views/utils/upload-image";
import { useAction } from "@/views/utils/use-action";

export type RetakeImage = { imageId: string; reason: Exclude<ImageQuality, "ok"> };

type Props = {
  caseDto: CaseDto;
  imageConsentGiven: boolean;
  onImageConsent: () => void;
  retake: RetakeImage[];
  onChanged: () => void;
  onBack: () => void;
  onContinue: () => void;
};

// Billeder er valgfrie. Særskilt samtykke gives lige før første upload (architecture 9.4). Billederne nedskaleres i
// browseren, og beskrivelsen af dem er en beskrivelse, ikke en vurdering.
export function ImagesStep({ caseDto, imageConsentGiven, onImageConsent, retake, onChanged, onBack, onContinue }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const action = useAction();
  const images = caseDto.images;
  const full = images.length >= MAX_IMAGES_PER_CASE;
  const retakeById = new Map(retake.map((r) => [r.imageId, r.reason]));

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    await action.run(async () => {
      let room = MAX_IMAGES_PER_CASE - images.length;
      for (const file of list.slice(0, room)) {
        await uploadImage(`/api/cases/${caseDto.id}/images`, file);
        room -= 1;
      }
      onChanged();
      return list.length === 1 ? "Billedet er uploadet." : "Billederne er uploadet.";
    });
    if (input.current) input.current.value = "";
  }

  async function remove(imageId: string) {
    await action.run(async () => {
      await apiRequest(`/api/cases/${caseDto.id}/images/${imageId}`, { method: "DELETE" });
      onChanged();
      return "Billedet er slettet.";
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Billeder (valgfrit)</h2>
        <p className="text-base leading-relaxed text-ink-muted">
          Et billede kan hjælpe klinikken med at forstå dit ønske, men du behøver ikke uploade noget. Tag gerne billederne i godt lys,
          forfra og fra siden. Billederne er helbredsoplysninger og deles først med de klinikker, du selv vælger at sende til.
        </p>
      </div>

      {!imageConsentGiven ? (
        <ConsentGate type="image_upload" onGranted={onImageConsent} />
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="billede-fil" className="text-sm font-semibold text-ink">
            Vælg billeder (JPEG eller PNG, højst {MAX_IMAGES_PER_CASE})
          </label>
          <input
            ref={input}
            id="billede-fil"
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            disabled={action.busy || full}
            onChange={(event) => void upload(event.target.files)}
            className="block w-full min-w-0 rounded-control border border-field-border bg-surface p-3 text-base text-ink file:mr-3 file:min-h-11 file:rounded-control file:border-0 file:bg-brand-600 file:px-4 file:font-semibold file:text-on-brand"
          />
          {full && <p className="text-sm text-ink-muted">Du har uploadet det højeste antal billeder.</p>}
        </div>
      )}

      <StatusMessage message={action.message} />

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Uploadede billeder">
          {images.map((image, index) => {
            const reason = retakeById.get(image.id);
            return (
              <li key={image.id} className="flex flex-col gap-2 rounded-card border border-line p-2" data-testid="billede">
                <img src={image.url} alt={`Dit billede ${index + 1}`} className="aspect-square w-full rounded-control object-cover" />
                {reason && <Badge tone="warning">{IMAGE_QUALITY_LABELS[reason]}: tag gerne et nyt</Badge>}
                <Button variant="danger-outline" className="min-h-11" disabled={action.busy} onClick={() => remove(image.id)}>
                  Slet billede
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {images.length > 0 && (
        <Alert tone="info" title={DESCRIPTION_LABEL}>
          Billederne bliver beskrevet af AI i opsummeringen (fx vinkel og hvad der er synligt). Beskrivelsen er ikke en vurdering. Klinikken
          vurderer selv billederne.
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          Tilbage
        </Button>
        <Button onClick={onContinue} disabled={action.busy}>
          {images.length > 0 ? "Fortsæt til behandlinger" : "Spring over og fortsæt"}
        </Button>
      </div>
    </div>
  );
}
