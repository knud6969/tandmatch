"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  PRICE_ACCURACY_LABEL,
  PRICE_ACCURACY_VALUES,
  REVIEW_TEXT_MAX_CHARS,
  REVIEW_TEXT_MIN_CHARS,
  REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS,
} from "@/lib/constants/reviews";
import { createReviewSchema } from "@/lib/schemas/reviews";
import type { PriceAccuracy, ReviewCreatedDto, ReviewEligibleItemDto } from "@/lib/types/reviews";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { ChoiceGroup } from "@/views/components/ui/choice-group";
import { cx } from "@/views/components/ui/cx";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { TextArea } from "@/views/components/ui/text-area";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { BOOKINGS_HREF, REVIEWS_HREF } from "@/views/utils/case-links";
import { fieldErrorsFrom } from "@/views/utils/field-errors";
import { formatDate, formatPriceRange, parseWholeKr } from "@/views/utils/format";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

const STAR_LABELS = ["1 stjerne", "2 stjerner", "3 stjerner", "4 stjerner", "5 stjerner"] as const;
const PRICE_OPTIONS = PRICE_ACCURACY_VALUES.map((value) => ({ value, label: PRICE_ACCURACY_LABEL[value] }));
const TRANSPARENCY_OPTIONS = [
  { value: "no", label: "Nej, prisen var tydelig" },
  { value: "yes", label: "Ja, der manglede gennemsigtighed" },
] as const;

export const loadEligibleVisits = async (): Promise<ReviewEligibleItemDto[]> =>
  (await apiRequest<{ items: ReviewEligibleItemDto[] }>("/api/reviews/eligible")).items;

// Stjernevalg som radioknapper. Hver stjerne er mindst 48 x 48 px, og selve radioknappen ligger oven på stjernen.
function StarInput({ value, onChange, error }: { value: number | null; onChange: (stars: number) => void; error?: string }) {
  const name = useId();
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={errorId}>
      <legend className="text-sm font-semibold text-ink">Hvor tilfreds var du?</legend>
      <div className="flex gap-1" data-testid="stjerner">
        {STAR_LABELS.map((label, index) => {
          const n = index + 1;
          const filled = value !== null && n <= value;
          return (
            <label
              key={n}
              className={cx(
                "relative flex size-12 cursor-pointer items-center justify-center rounded-control text-4xl leading-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700",
                filled ? "text-brand-700" : "text-ink-muted/50 hover:text-brand-400",
              )}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                aria-label={label}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span aria-hidden="true">★</span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Friendly({ title, children }: { title: string; children: string }) {
  return (
    <Card className="flex flex-col gap-3" data-testid="anmeld-ikke-mulig">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-base text-ink-muted">{children}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <LinkButton href={REVIEWS_HREF} className="w-full sm:w-fit">
          Til mine anmeldelser
        </LinkButton>
        <LinkButton href={BOOKINGS_HREF} variant="secondary" className="w-full sm:w-fit">
          Til mine bookinger
        </LinkButton>
      </div>
    </Card>
  );
}

type FieldKey = "stars" | "text" | "priceAccuracy" | "actualPrice" | "transparencyComment";

function Form({ item, onDone }: { item: ReviewEligibleItemDto; onDone: () => void }) {
  const [stars, setStars] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [accuracy, setAccuracy] = useState<PriceAccuracy | null>(null);
  const [actual, setActual] = useState("");
  const [lacked, setLacked] = useState<"yes" | "no" | null>(null);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const submit = useAction();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found: Partial<Record<FieldKey, string>> = {};
    const actualPrice = actual.trim() === "" ? undefined : parseWholeKr(actual);
    if (actual.trim() !== "" && actualPrice === null) found.actualPrice = "Angiv prisen i hele kroner, fx 1.200.";
    const parsed = createReviewSchema.safeParse({
      bookingId: item.bookingId,
      stars: stars ?? undefined,
      text,
      priceAccuracy: accuracy ?? undefined,
      actualPrice: actualPrice ?? undefined,
      lackedTransparency: lacked === null ? undefined : lacked === "yes",
      transparencyComment: lacked === "yes" ? comment : undefined,
    });
    if (!parsed.success) {
      const { fields } = fieldErrorsFrom<FieldKey>(parsed.error);
      if (!stars) fields.stars = "Vælg, hvor mange stjerner du giver.";
      for (const [key, value] of Object.entries(fields)) found[key as FieldKey] ??= value;
    }
    setErrors(found);
    if (!parsed.success || Object.keys(found).length > 0) {
      submit.fail("Tjek felterne markeret med rødt, og prøv igen.");
      return;
    }
    const ok = await submit.run(async () => {
      await apiRequest<ReviewCreatedDto>("/api/reviews", { method: "POST", body: parsed.data });
    });
    if (ok) onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6" data-testid="anmeldelsesformular">
      <StarInput value={stars} onChange={setStars} error={errors.stars} />
      <div className="flex flex-col gap-1.5">
        <TextArea
          label="Din anmeldelse"
          hint={`Skriv mindst ${REVIEW_TEXT_MIN_CHARS} tegn om dit besøg.`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={REVIEW_TEXT_MAX_CHARS}
          error={errors.text}
          rows={6}
        />
        <p className="text-sm text-ink-muted" data-testid="tegntaeller">
          {text.trim().length} af {REVIEW_TEXT_MAX_CHARS} tegn
        </p>
      </div>
      <ChoiceGroup
        legend="Svarede den endelige pris til prisoverslaget?"
        options={PRICE_OPTIONS}
        value={accuracy}
        onChange={setAccuracy}
        error={errors.priceAccuracy}
      />
      <TextField
        label="Den faktiske pris (valgfri)"
        hint="I hele kroner. Vises sammen med din anmeldelse."
        inputMode="numeric"
        autoComplete="off"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        error={errors.actualPrice}
      />
      <ChoiceGroup
        legend="Manglede der gennemsigtighed om prisen? (valgfri)"
        options={TRANSPARENCY_OPTIONS}
        value={lacked}
        onChange={setLacked}
      />
      {lacked === "yes" && (
        <TextArea
          label="Hvad manglede? (valgfri)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS}
          error={errors.transparencyComment}
          rows={3}
        />
      )}
      <Alert tone="info" title="Anmeldelsen modereres">
        Anmeldelsen læses igennem, før den vises offentligt. Den må ikke indeholde personoplysninger om andre eller injurierende udsagn.
        Du kan ikke redigere den bagefter.
      </Alert>
      <StatusMessage message={submit.message} />
      <Button type="submit" disabled={submit.busy} className="w-full sm:w-fit">
        {submit.busy ? "Sender …" : "Send anmeldelse"}
      </Button>
    </form>
  );
}

// Anmeldelse af ét besøg (architecture 6.2, 8.2). Formularen hentes ud fra de besøg, der kan anmeldes; ellers en venlig besked.
export function ReviewFormPage({ bookingId }: { bookingId: string }) {
  const { data, loading, error, reload } = useLoad(loadEligibleVisits);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card className="flex flex-col gap-3" data-testid="anmeldelse-kvittering">
        <h2 className="text-xl font-semibold text-ink">Tak for din anmeldelse</h2>
        <p className="text-base text-ink-muted">
          Anmeldelsen afventer godkendelse og vises på klinikkens profil, når den er godkendt. Du kan følge status under dine anmeldelser.
        </p>
        <LinkButton href={REVIEWS_HREF} className="w-full sm:w-fit">
          Tilbage til mine anmeldelser
        </LinkButton>
      </Card>
    );
  }
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const item = data.find((i) => i.bookingId === bookingId);
  if (!item) {
    return (
      <Friendly title="Dette besøg kan ikke anmeldes">
        Enten er der ikke gået 24 timer siden besøget, besøget blev ikke gennemført, eller du har allerede anmeldt det.
      </Friendly>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-1 p-4 sm:p-5" data-testid="anmeld-besoeg">
        <p className="text-lg font-semibold text-ink">{item.clinicName}</p>
        <p className="text-base text-ink">
          {item.serviceName} · {formatDate(item.visitedOn)}
        </p>
        <p className="text-sm text-ink-muted" data-testid="prisoverslag">
          {item.priceEstimate
            ? `Prisoverslag: ${formatPriceRange(item.priceEstimate.min, item.priceEstimate.max)} (ifølge klinikkens svar eller prisliste)`
            : "Du fik ikke et prisoverslag via TandMatch."}
        </p>
      </Card>
      <Form item={item} onDone={() => setDone(true)} />
      <p>
        <Link href={REVIEWS_HREF} className="inline-flex min-h-11 items-center font-semibold text-brand-700">
          Annuller og gå tilbage
        </Link>
      </p>
    </div>
  );
}
