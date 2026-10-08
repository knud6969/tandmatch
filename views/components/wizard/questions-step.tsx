"use client";

import { useState, type Ref } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { ChoiceGroup } from "@/views/components/ui/choice-group";
import { TextArea } from "@/views/components/ui/text-area";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { FREE_TEXT_MAX_CHARS } from "@/lib/constants/limits";
import { PLACEHOLDER_QUESTIONS } from "@/lib/constants/questions";
import type { RequestDraftDto } from "@/lib/types/requests";
import { StepFrame, StepNav, type StepProps } from "@/views/components/wizard/wizard-shared";

type Answers = Record<string, string | string[]>;


// Trin 2: faste spørgsmål (pladsholdere) og fri tekst. Fri tekst kræver konto (architecture 10.4).
export function QuestionsStep({
  draft,
  onDraftChange,
  isAnonymous,
  goTo,
  headingRef,
}: StepProps & { headingRef: Ref<HTMLHeadingElement> }) {
  const [answers, setAnswers] = useState<Answers>(draft.answers);
  const [freeText, setFreeText] = useState(draft.freeText ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(key: string, value: string | string[] | null) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === null || (Array.isArray(value) && value.length === 0) || value === "") {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  function toggleMulti(key: string, value: string) {
    const current = answers[key];
    const list = Array.isArray(current) ? current : [];
    setAnswer(key, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function saveAndContinue() {
    setPending(true);
    setError(null);
    try {
      const body: { answers: Answers; freeText?: string | null } = { answers };
      if (!isAnonymous) {
        body.freeText = freeText.trim() === "" ? null : freeText.trim();
      }
      const next = await apiRequest<RequestDraftDto>(`/api/requests/${draft.id}`, { method: "PATCH", body });
      onDraftChange(next);
      goTo("chat");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <StepFrame index={2} title="Få det med i din forespørgsel" headingRef={headingRef}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Pladsholdere</Badge>
        <span className="text-sm text-ink-muted">Spørgsmålene er midlertidige og bliver endelige senere.</span>
      </div>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {PLACEHOLDER_QUESTIONS.map((question) => {
        if (!question.multiple) {
          const current = typeof answers[question.key] === "string" ? (answers[question.key] as string) : null;
          return (
            <ChoiceGroup
              key={question.key}
              legend={question.label}
              options={question.options}
              value={current}
              onChange={(value) => setAnswer(question.key, value)}
            />
          );
        }
        const selected = Array.isArray(answers[question.key]) ? (answers[question.key] as string[]) : [];
        return (
          <fieldset key={question.key} className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-ink">{question.label} (flere kan vælges)</legend>
            <div className="grid gap-2.5">
              {question.options.map((option) => (
                <CheckboxField
                  key={option.value}
                  name={`${question.key}-${option.value}`}
                  checked={selected.includes(option.value)}
                  onChange={() => toggleMulti(question.key, option.value)}
                  label={option.label}
                />
              ))}
            </div>
          </fieldset>
        );
      })}

      {isAnonymous ? (
        <Alert tone="info" title="Fri tekst kræver en konto">
          <p>
            Som anonym skriver du din beskrivelse i chatten i næste trin. Fri tekst kan du bruge, når du har oprettet
            en konto.
          </p>
        </Alert>
      ) : (
        <TextArea
          label="Fri tekst (valgfrit)"
          hint={`Skriv med dine egne ord, hvis chatten ikke passer dig. Max ${FREE_TEXT_MAX_CHARS} tegn.`}
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
          maxLength={FREE_TEXT_MAX_CHARS}
          rows={4}
        />
      )}

      <StepNav
        onBack={() => goTo("kategori")}
        onNext={() => void saveAndContinue()}
        nextLabel="Gem og fortsæt"
        pending={pending}
      />
    </StepFrame>
  );
}
