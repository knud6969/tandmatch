"use client";

import { useState, type FormEvent, type Ref } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { TextArea } from "@/views/components/ui/text-area";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import {
  AI_BOUNDARY_TEXT,
  DESCRIPTION_LABEL,
  IMAGE_QUALITY_LABELS,
  OUT_OF_SCOPE_NOTICE,
} from "@/lib/constants/ai-texts";
import { SUMMARY_MAX_CHARS } from "@/lib/constants/limits";
import type { AiSummary } from "@/lib/types/ai";
import type { ImageDto } from "@/lib/types/common";
import type { SummaryResponse } from "@/lib/types/requests";
import { StepFrame, StepNav, hasActiveConsent, type StepProps } from "@/views/components/wizard/wizard-shared";


const RETAKE_REASON_LABELS: Record<SummaryResponse["retakeImages"][number]["reason"], string> = {
  too_dark: "For mørkt",
  blurry: "Uskarpt",
  wrong_angle: "Forkert vinkel",
  not_teeth: "Viser ikke tænder",
};

function imageNumber(images: ImageDto[], imageId: string): number | null {
  const index = images.findIndex((image) => image.id === imageId);
  return index === -1 ? null : index + 1;
}

// Trin 5: udkast fra AI, som patienten retter og godkender. PUT godkender og gemmer (architecture 10.4).
export function SummaryStep({
  draft,
  onDraftChange,
  consents,
  goTo,
  headingRef,
}: StepProps & { headingRef: Ref<HTMLHeadingElement> }) {
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [text, setText] = useState(draft.summaryText ?? draft.aiSummary?.summaryText ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const hasAi = hasActiveConsent(consents, "ai_processing");

  const summary: AiSummary | null = result ? result.summary : draft.aiSummary;
  const trimmed = text.trim();
  const approvedAndUnchanged = draft.summaryApprovedAt !== null && trimmed === (draft.summaryText ?? "");
  // Teksten er redigeret, hvis den ikke længere er det sidste AI-udkast (eller patienten skrev den selv).
  const lastAiText = result ? (result.summary?.summaryText ?? null) : (draft.aiSummary?.summaryText ?? null);
  const hasEdits = trimmed.length > 0 && trimmed !== (lastAiText ?? "");

  // Et nyt udkast erstatter teksten. Redigeret tekst må ikke forsvinde uden at patienten har sagt ja.
  function requestGenerate() {
    if (hasEdits) {
      setConfirmRegenerate(true);
      return;
    }
    void generate();
  }

  async function generate() {
    setConfirmRegenerate(false);
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await apiRequest<SummaryResponse>(`/api/requests/${draft.id}/summary`, { method: "POST" });
      setResult(response);
      if (response.summary) setText(response.summary.summaryText);
    } catch (err) {
      setGenerateError(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed.length === 0 || trimmed.length > SUMMARY_MAX_CHARS) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await apiRequest<{ summaryText: string; summaryApprovedAt: string | null }>(
        `/api/requests/${draft.id}/summary`,
        { method: "PUT", body: { summaryText: trimmed } },
      );
      onDraftChange({ ...draft, summaryText: saved.summaryText, summaryApprovedAt: saved.summaryApprovedAt });
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepFrame index={5} title="Gennemgå og godkend opsummeringen" headingRef={headingRef}>
      <p className="text-base leading-relaxed text-ink-muted">
        Her er et udkast til det, tandlægen skal vide. Det er din tekst, der bliver sendt, så ret den, til den passer til
        dig.
      </p>

      <Alert tone="info" title="AI’en giver ikke medicinsk rådgivning">
        <p>{AI_BOUNDARY_TEXT} Udkastet beskriver kun det, du har skrevet, og det synlige på billederne.</p>
      </Alert>

      {!hasAi && (
        <Alert tone="warning" title="Du mangler samtykke til AI-assistenten">
          <p>Giv samtykke i chat-trinnet, før der kan laves et udkast. Du kan stadig skrive opsummeringen selv nedenfor.</p>
          <Button variant="secondary" className="mt-3 w-full sm:w-auto" onClick={() => goTo("chat")}>
            Gå til chat
          </Button>
        </Alert>
      )}

      <div>
        <Button
          variant="secondary"
          fullWidth
          className="sm:w-auto"
          disabled={generating || !hasAi}
          onClick={requestGenerate}
        >
          {generating ? "Laver udkast …" : (summary || result) ? "Lav et nyt udkast" : "Lav opsummering"}
        </Button>
        {result?.generationsLeft !== undefined && (
          <p className="mt-2 text-sm text-ink-muted">Du kan lave {result.generationsLeft} flere udkast.</p>
        )}
      </div>

      {confirmRegenerate && (
        <Alert tone="warning" title="Erstat din redigerede tekst?" role="alert">
          <p>Du har ændret opsummeringen. Et nyt udkast erstatter din tekst.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void generate()} className="w-full sm:w-auto">
              Ja, erstat min tekst
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRegenerate(false)} className="w-full sm:w-auto">
              Nej, behold min tekst
            </Button>
          </div>
        </Alert>
      )}

      {generateError && (
        <Alert tone="danger" role="alert">
          {generateError}
        </Alert>
      )}

      {result && <ResultNotices result={result} images={draft.images} goTo={goTo} />}

      {summary && <SummaryView summary={summary} images={draft.images} />}

      <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-4">
        {saveError && (
          <Alert tone="danger" role="alert">
            {saveError}
          </Alert>
        )}
        <TextArea
          label="Din opsummering"
          hint={`Det tandlægen ser. Max ${SUMMARY_MAX_CHARS} tegn. ${trimmed.length}/${SUMMARY_MAX_CHARS}.`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          maxLength={SUMMARY_MAX_CHARS + 200}
          error={trimmed.length > SUMMARY_MAX_CHARS ? `Opsummeringen må højst være ${SUMMARY_MAX_CHARS} tegn.` : undefined}
        />
        {draft.summaryApprovedAt && approvedAndUnchanged && (
          <Alert tone="success" title="Opsummeringen er godkendt">
            <p>Du kan sende forespørgslen, når de andre trin er klar.</p>
          </Alert>
        )}
        {draft.summaryApprovedAt && !approvedAndUnchanged && (
          <Alert tone="warning" title="Du har ændret teksten">
            <p>Gem for at godkende den nye tekst.</p>
          </Alert>
        )}
        <Button
          type="submit"
          fullWidth
          className="sm:w-auto"
          disabled={saving || trimmed.length === 0 || trimmed.length > SUMMARY_MAX_CHARS}
        >
          {saving ? "Gemmer …" : "Godkend og gem opsummering"}
        </Button>
        <p className="text-sm text-ink-muted">
          Når du godkender, bliver teksten gemt. Hvis du ændrer chat eller billeder bagefter, skal du godkende igen.
        </p>
      </form>

      <StepNav onBack={() => goTo("billeder")} onNext={() => goTo("send")} nextLabel="Næste: send" />
    </StepFrame>
  );
}

function ResultNotices({
  result,
  images,
  goTo,
}: {
  result: SummaryResponse;
  images: ImageDto[];
  goTo: (step: "billeder") => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {result.outOfScopeNotice && (
        <Alert tone="info" title="Tandlægens opgave">
          <p>{OUT_OF_SCOPE_NOTICE}</p>
        </Alert>
      )}
      {result.retakeImages.length > 0 && (
        <Alert tone="warning" title="Nogle billeder skal tages om" role="alert">
          <ul className="list-disc pl-5">
            {result.retakeImages.map((retake) => {
              const number = imageNumber(images, retake.imageId);
              return (
                <li key={retake.imageId}>
                  {number ? `Billede ${number}` : "Et billede"}: {RETAKE_REASON_LABELS[retake.reason]}
                </li>
              );
            })}
          </ul>
          <p className="mt-2">Slet billedet og upload et nyt, eller skriv opsummeringen selv nedenfor.</p>
          <Button variant="secondary" className="mt-3 w-full sm:w-auto" onClick={() => goTo("billeder")}>
            Gå til billeder
          </Button>
        </Alert>
      )}
      {result.fallback === "write_yourself" && (
        <Alert tone="warning" title="Vi kunne ikke lave et udkast" role="alert">
          <p>AI-assistenten kunne ikke lave et udkast denne gang. Skriv din beskrivelse selv nedenfor.</p>
        </Alert>
      )}
    </div>
  );
}

function SummaryView({ summary, images }: { summary: AiSummary; images: ImageDto[] }) {
  return (
    <section aria-labelledby="ai-udkast" className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="ai-udkast" className="text-lg font-semibold text-ink">
          Udkast fra AI-assistenten
        </h3>
        <Badge tone="brand">{DESCRIPTION_LABEL}</Badge>
      </div>

      {summary.patientWishes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink">Det du ønsker</h4>
          <ul className="mt-1 list-disc pl-5 text-base text-ink">
            {summary.patientWishes.map((wish, index) => (
              <li key={index}>{wish}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.patientReportedHistory.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink">Det du har oplyst</h4>
          <ul className="mt-1 list-disc pl-5 text-base text-ink">
            {summary.patientReportedHistory.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.images.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-ink">Billeder</h4>
          {summary.images.map((observation) => {
            const number = imageNumber(images, observation.imageRef);
            return (
              <div key={observation.imageRef} className="rounded-lg bg-canvas p-3">
                <p className="text-base font-semibold text-ink">
                  {number ? `Billede ${number}` : "Billede"}: {observation.visibleArea}
                </p>
                <p className="text-sm text-ink-muted">Kvalitet: {IMAGE_QUALITY_LABELS[observation.quality]}</p>
                {observation.observations.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-base text-ink">
                    {observation.observations.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
