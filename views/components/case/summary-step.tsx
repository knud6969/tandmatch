"use client";

import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
import { useState } from "react";
import { CHAT_NOT_SHARED_TEXT, DESCRIPTION_LABEL, IMAGE_QUALITY_LABELS, OUT_OF_SCOPE_NOTICES } from "@/lib/constants/ai-texts";
import { SUMMARY_MAX_CHARS } from "@/lib/constants/limits";
import type { SummaryResponse, ApproveSummaryResponse } from "@/lib/types/ai";
import type { CaseDto } from "@/lib/types/cases";
import type { ImageDto } from "@/lib/types/common";
import type { RetakeImage } from "@/views/components/case/images-step";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button, LinkButton } from "@/views/components/ui/button";
import { StatusMessage } from "@/views/components/ui/status-message";
import { TextArea } from "@/views/components/ui/text-area";
import { apiRequest } from "@/views/utils/api-client";
import { clinicsHref } from "@/views/utils/case-links";
import { useAction } from "@/views/utils/use-action";

// AI'ens neutrale billedbeskrivelse. Feltet `description` mangler endnu på ImageDto i lib/types/common.ts (anmodning til backend, 3.6b).
type DescribedImage = ImageDto & { description?: string | null };

type Props = {
  caseDto: CaseDto;
  retake: RetakeImage[];
  onRetake: (items: RetakeImage[]) => void;
  onChanged: () => void;
  onBack: () => void;
  onGoToImages: () => void;
};

// Udkast til opsummering, som patienten selv retter og godkender. Opsummeringen er en beskrivelse af det, patienten har
// fortalt, og ikke en vurdering. Det er den, der deles med klinikkerne, ikke samtalen.
export function SummaryStep({ caseDto, retake, onRetake, onChanged, onBack, onGoToImages }: Props) {
  const initial = caseDto.summaryText ?? caseDto.aiSummary?.summaryText ?? "";
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(initial !== "");
  const [approvedText, setApprovedText] = useState<string | null>(caseDto.summaryApprovedAt ? caseDto.summaryText : null);
  const [notice, setNotice] = useState<string[]>([]);
  const [generationsLeft, setGenerationsLeft] = useState<number | null>(null);
  const generate = useAction();
  const approve = useAction();

  const approved = approvedText !== null && approvedText === text.trim();

  async function makeDraft() {
    await generate.run(async () => {
      const result = await apiRequest<SummaryResponse>(`/api/cases/${caseDto.id}/summary`, { method: "POST", body: {} });
      setGenerationsLeft(result.generationsLeft);
      onRetake(result.retakeImages);
      setNotice(result.outOfScopeNotice ? Object.values(OUT_OF_SCOPE_NOTICES) : []);
      setEditing(true);
      if (result.summary) {
        setText(result.summary.summaryText);
        setApprovedText(null);
        onChanged();
      } else {
        return "Vi kunne ikke lave et udkast. Skriv opsummeringen selv i feltet nedenfor.";
      }
    });
  }

  async function approveText() {
    await approve.run(async () => {
      const result = await apiRequest<ApproveSummaryResponse>(`/api/cases/${caseDto.id}/summary`, {
        method: "PUT",
        body: { summaryText: text.trim() },
      });
      setApprovedText(result.summaryText);
      onChanged();
      return "Opsummeringen er godkendt.";
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Din opsummering</h2>
        <p className="text-base leading-relaxed text-ink-muted">
          Det her er en beskrivelse af det, du har fortalt, så klinikkerne hurtigt kan forstå dit behov. Den er ikke en vurdering. Klinikken
          laver den endelige vurdering. {CHAT_NOT_SHARED_TEXT}
        </p>
      </div>

      <section aria-label="Dine valg" className="flex flex-col gap-2 rounded-card bg-surface-muted p-4">
        <p className="text-sm font-semibold text-ink">Dine bekræftede behandlinger</p>
        {caseDto.services.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {caseDto.services.map((service) => (
              <li key={service.id}>
                <Badge tone="brand">{service.name}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Du har ikke bekræftet nogen behandlinger endnu.</p>
        )}
        <p className="text-sm text-ink-muted">
          {caseDto.images.length} billede
          {caseDto.images.length === 1 ? "" : "r"} vedhæftet.
        </p>
      </section>

      {caseDto.images.length > 0 && (
        <section aria-label="Billedbeskrivelser" className="flex flex-col gap-3" data-testid="billedbeskrivelser">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-ink">Dine billeder og AI&apos;ens beskrivelse af dem</h3>
            <p className="text-sm text-ink-muted">
              Beskrivelserne er en neutral gengivelse af, hvad billedet viser, og er en del af det, du godkender nedenfor. Klinikken
              vurderer billederne selv.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {(caseDto.images as DescribedImage[]).map((image, index) => (
              <li key={image.id} className="flex gap-3 rounded-card border border-line bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- signeret URL fra lagring, ingen optimering */}
                <img src={image.url} alt={`Dit billede ${index + 1}`} className="size-20 shrink-0 rounded-control object-cover" />
                <div className="flex min-w-0 flex-col gap-1">
                  <p>
                    <Badge tone="neutral">{DESCRIPTION_LABEL}</Badge>
                  </p>
                  <p className="text-sm leading-relaxed text-ink">
                    {image.description ?? "Ingen beskrivelse. Billedet sendes uden AI-beskrivelse."}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {retake.length > 0 && (
        <Alert tone="warning" title="Nogle billeder kan være svære at bruge" role="alert">
          <ul className="list-disc pl-5">
            {retake.map((item) => (
              <li key={item.imageId}>{IMAGE_QUALITY_LABELS[item.reason]}</li>
            ))}
          </ul>
          <p className="mt-2">Du kan tage nye billeder, men det er ikke et krav.</p>
          <Button variant="secondary" className="mt-3" onClick={onGoToImages}>
            Tag nye billeder
          </Button>
        </Alert>
      )}

      {notice.map((line) => (
        <Alert key={line} tone="info">
          {line}
        </Alert>
      ))}

      {!editing ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={makeDraft} disabled={generate.busy}>
            {generate.busy ? "Laver udkast …" : "Lav udkast til opsummering"}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)} disabled={generate.busy}>
            Skriv selv
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TextArea
            label="Opsummering til klinikkerne"
            hint="Ret teksten, så den passer til dig. Du skal godkende den, før du kan gå videre."
            value={text}
            maxLength={SUMMARY_MAX_CHARS}
            rows={8}
            onChange={(event) => setText(event.target.value)}
          />
          <p className="text-sm text-ink-muted">
            {text.length} af {SUMMARY_MAX_CHARS} tegn.
            {generationsLeft !== null && ` Du kan lave ${generationsLeft} nye udkast.`}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={approveText} disabled={approve.busy || text.trim() === "" || approved}>
              {approved ? "Godkendt" : approve.busy ? "Godkender …" : "Godkend opsummering"}
            </Button>
            <Button variant="secondary" onClick={makeDraft} disabled={generate.busy}>
              {generate.busy ? "Laver udkast …" : "Lav nyt udkast"}
            </Button>
          </div>
        </div>
      )}

      <StatusMessage message={generate.message} />
      <StatusMessage message={approve.message} />

      {approved && (
        <Alert tone="success" title="Klar til næste skridt">
          <p>Næste skridt er at finde klinikker. Her vælger du op til {MAX_ACTIVE_LEADS_PER_CASE}, og her opretter du en konto, før noget sendes.</p>
          <LinkButton href={clinicsHref(caseDto)} className="mt-3 w-full sm:w-auto">
            Næste: find klinikker
          </LinkButton>
        </Alert>
      )}

      <div className="flex">
        <Button variant="ghost" onClick={onBack}>
          Tilbage
        </Button>
      </div>
    </div>
  );
}
