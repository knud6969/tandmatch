"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/views/utils/api-errors";

// Gem-tilstand for en formular (saving, error, savedAt, dirty). `props` kan spredes direkte på <SaveBar>.
export function useSaveState(dirty: boolean) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Kører gemningen og returnerer true, hvis den lykkedes. Fejl vises som dansk besked i gem-linjen.
  async function save(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    setSaving(true);
    try {
      await action();
      setSavedAt(new Date());
      return true;
    } catch (e) {
      setError(apiErrorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { save, setError, props: { dirty, saving, savedAt, error } };
}
