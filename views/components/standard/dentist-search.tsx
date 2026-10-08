"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DentistCard } from "@/views/components/standard/dentist-card";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { SERVICE_OPTIONS, serviceLabel } from "@/lib/constants/standard";
import type { StandardService } from "@/lib/types/common";
import type { DentistListItemDto } from "@/lib/types/standard";

type Query = { postalCode: string; service: StandardService };

type Result = { query: Query; items: DentistListItemDto[] } | { query: Query; error: string };

// Standard-sporet: postnummer og ydelse, og listen sorteres af API'et efter afstand (architecture 10.8).
export function DentistSearch() {
  const [postalCode, setPostalCode] = useState("");
  const [service, setService] = useState<StandardService | "">("");
  const [formError, setFormError] = useState<{ postalCode?: string; service?: string }>({});
  const [query, setQuery] = useState<Query | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!query) return;
    let active = true;
    const params = new URLSearchParams({ service: query.service });
    if (query.postalCode) params.set("postalCode", query.postalCode);
    apiRequest<{ dentists: DentistListItemDto[] }>(`/api/dentists?${params.toString()}`)
      .then(({ dentists }) => {
        if (active) setResult({ query, items: dentists });
      })
      .catch((err: unknown) => {
        if (active) setResult({ query, error: apiErrorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, [query]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = postalCode.trim();
    const errors: { postalCode?: string; service?: string } = {};
    if (trimmed !== "" && !/^[0-9]{4}$/.test(trimmed)) errors.postalCode = "Angiv et postnummer med fire cifre, fx 2100.";
    if (service === "") errors.service = "Vælg en ydelse.";
    setFormError(errors);
    if (Object.keys(errors).length > 0 || service === "") return;
    setQuery({ postalCode: trimmed, service });
  }

  const current = result && query && result.query === query ? result : null;

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Søg efter tandlæger">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Dit postnummer (valgfri)"
              hint="Bruges til at sortere efter afstand."
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={4}
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              error={formError.postalCode}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ydelse" className="text-sm font-semibold text-ink">
                Ydelse
              </label>
              <select
                id="ydelse"
                value={service}
                onChange={(event) => setService(event.target.value as StandardService | "")}
                aria-invalid={formError.service ? true : undefined}
                aria-describedby={formError.service ? "ydelse-fejl" : undefined}
                className="min-h-12 w-full rounded-lg border border-field-border bg-surface px-3.5 text-base text-ink aria-[invalid=true]:border-danger-line"
              >
                <option value="">Vælg en ydelse</option>
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formError.service && (
                <p id="ydelse-fejl" className="text-sm font-medium text-danger-ink">
                  {formError.service}
                </p>
              )}
            </div>
          </div>
          <Button type="submit" className="w-full sm:w-auto sm:self-start">
            Find tandlæger
          </Button>
        </form>
      </Card>

      {!query && (
        <p className="text-base text-ink-muted">
          Vælg en ydelse for at se tandlæger, deres prisinterval, næste ledige tid og anmeldelser.
        </p>
      )}

      {query && !current && (
        <p role="status" className="text-base text-ink-muted">
          Søger efter tandlæger …
        </p>
      )}

      {current && "error" in current && (
        <Alert tone="danger" role="alert" title="Tandlægerne kunne ikke hentes">
          {current.error}
        </Alert>
      )}

      {current && "items" in current && (
        <section aria-label="Resultater" className="flex flex-col gap-5">
          {current.items.length === 0 ? (
            <Card>
              <p className="text-base leading-relaxed text-ink-muted">
                Der er ingen tandlæger, der tilbyder {serviceLabel(current.query.service).toLowerCase()}
                {current.query.postalCode ? ` i nærheden af ${current.query.postalCode}` : ""} endnu. Prøv et andet
                postnummer.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-base text-ink-muted" role="status">
                {current.items.length === 1 ? "1 tandlæge" : `${current.items.length} tandlæger`}, sorteret efter afstand
              </p>
              <ul aria-label="Tandlæger" className="flex flex-col gap-4">
                {current.items.map((item) => (
                  <li key={item.id}>
                    <DentistCard item={item} service={current.query.service} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
