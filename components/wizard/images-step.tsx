"use client";

import { useRef, useState, type ChangeEvent, type Ref } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { CONSENT_TEXTS } from "@/lib/constants/consents";
import { MAX_IMAGES_PER_REQUEST } from "@/lib/constants/limits";
import type { ImageDto } from "@/lib/types/common";
import { ConsentGate } from "@/components/wizard/consent-gate";
import { ImagePrepareError, prepareJpeg } from "@/components/wizard/prepare-image";
import { StepFrame, StepNav, hasActiveConsent, type StepProps } from "@/components/wizard/wizard-shared";

// Trin 4: billeder (valgfrit). Særskilt billedsamtykke lige før første upload (architecture 9.4).
export function ImagesStep({
  headingRef,
  ...props
}: StepProps & { headingRef: Ref<HTMLHeadingElement> }) {
  const { draft, onDraftChange, reloadDraft, consents, reloadConsents, goTo } = props;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retriedAfterImageError = useRef(false);
  const hasImageConsent = hasActiveConsent(consents, "image_upload");
  const count = draft.images.length;
  const atLimit = count >= MAX_IMAGES_PER_REQUEST;

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const blob = await prepareJpeg(file);
      const form = new FormData();
      form.append("file", blob, "billede.jpg");
      const image = await apiRequest<ImageDto>(`/api/requests/${draft.id}/images`, { method: "POST", form });
      // Serveren nulstiller godkendelsen af opsummeringen ved nyt billede (architecture 9.3).
      onDraftChange({ ...draft, images: [...draft.images, image], summaryApprovedAt: null });
    } catch (err) {
      setError(err instanceof ImagePrepareError ? err.message : apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function removeImage(imageId: string) {
    setPending(true);
    setError(null);
    try {
      await apiRequest<void>(`/api/requests/${draft.id}/images/${imageId}`, { method: "DELETE" });
      onDraftChange({ ...draft, images: draft.images.filter((image) => image.id !== imageId) });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  // Signerede adresser udløber efter 5 minutter. Ved en ødelagt miniature hentes kladden igen, én gang.
  function onThumbnailError() {
    if (retriedAfterImageError.current) return;
    retriedAfterImageError.current = true;
    void reloadDraft();
  }

  return (
    <StepFrame index={4} title="Billeder (valgfrit)" headingRef={headingRef}>
      {!hasImageConsent ? (
        <>
          <Alert tone="info" title="Du må gerne springe billeder over">
            <p>
              Fotos af din mund er helbredsoplysninger. Du kan vælge at uploade billeder eller gå videre uden. Dit
              samtykke gælder kun billeder og er ikke det samme som at acceptere vilkårene.
            </p>
          </Alert>
          <ConsentGate
            type="image_upload"
            title="Giv samtykke til billeder"
            intro={
              <p>
                Billeder gemmes i den sikre billedtjeneste og bruges til opsummeringen. Højst 5 billeder, JPEG, højst 4 MB
                pr. billede.
              </p>
            }
            buttonLabel="Giv samtykke og vælg billeder"
            onGranted={reloadConsents}
          />
        </>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <label htmlFor="billede-upload" className="text-sm font-semibold text-ink">
              Vælg et billede
            </label>
            <p className="text-sm text-ink-muted">
              JPEG, højst 4 MB. Store billeder skaleres ned i din browser, før de sendes. {count} af {MAX_IMAGES_PER_REQUEST}{" "}
              uploadet.
            </p>
            <input
              id="billede-upload"
              type="file"
              accept="image/jpeg"
              onChange={(event) => void onFileChange(event)}
              disabled={pending || atLimit}
              className="min-h-12 w-full cursor-pointer text-base text-ink file:mr-4 file:min-h-12 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-600 file:px-5 file:font-semibold file:text-white hover:file:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {atLimit && <p className="text-sm font-medium text-ink-muted">Du har nået grænsen på 5 billeder.</p>}
            {pending && (
              <p role="status" className="text-sm font-medium text-ink-muted">
                Behandler billedet …
              </p>
            )}
          </div>

          {error && (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          )}

          {count > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {draft.images.map((image, index) => (
                <li key={image.id} className="flex flex-col gap-2">
                  {/* Signerede URL'er fra API'et (architecture 9.3); next/image kræver ikke en konfiguration for dem. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`Billede ${index + 1} af ${count}, som du har uploadet`}
                    onError={onThumbnailError}
                    className="aspect-square w-full rounded-lg border border-line bg-canvas object-cover"
                  />
                  <Button
                    variant="secondary"
                    className="min-h-12 w-full"
                    disabled={pending}
                    onClick={() => void removeImage(image.id)}
                    aria-label={`Slet billede ${index + 1}`}
                  >
                    Slet
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-sm text-ink-muted">
            Billederne bruges, når du laver opsummeringen. Tandlægen ser dem først, når du har sendt forespørgslen.
          </p>
          <p className="text-xs text-ink-muted">Samtykke: {CONSENT_TEXTS.image_upload}</p>
        </div>
      )}
      <StepNav onBack={() => goTo("chat")} onNext={() => goTo("opsummering")} nextLabel="Næste: opsummering" />
    </StepFrame>
  );
}
