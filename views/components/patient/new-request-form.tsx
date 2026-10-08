"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { ChoiceGroup } from "@/views/components/ui/choice-group";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { CATEGORY_OPTIONS } from "@/lib/constants/categories";
import type { CosmeticCategory } from "@/lib/types/common";
import type { RequestDraftDto } from "@/lib/types/requests";

// Opretter en kladde for en patient med konto og sender vedkommende videre til wizarden.
export function NewRequestForm({ initialCategory }: { initialCategory: CosmeticCategory | null }) {
  const router = useRouter();
  const [category, setCategory] = useState<CosmeticCategory | null>(initialCategory);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | undefined>(undefined);

  async function onSubmit() {
    if (!category) {
      setCategoryError("Vælg hvad din henvendelse handler om.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const draft = await apiRequest<RequestDraftDto>("/api/requests", { method: "POST", body: { category } });
      router.push(`/start/${draft.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-7"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <ChoiceGroup
        legend="Hvad drejer din henvendelse sig om?"
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={(value) => {
          setCategory(value);
          setCategoryError(undefined);
        }}
        error={categoryError}
      />
      <Button type="submit" fullWidth className="sm:w-auto" disabled={pending}>
        {pending ? "Opretter …" : "Fortsæt til samtalen"}
      </Button>
    </form>
  );
}
