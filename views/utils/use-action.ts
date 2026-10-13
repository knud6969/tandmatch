"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/views/utils/api-errors";

export type ActionMessage = { tone: "danger" | "success"; text: string };

// Fælles mønster for handlinger, der gemmes straks (upload, slet, tilføj): optaget-flag og én besked, som vises i en
// <StatusMessage>. `action` returnerer teksten ved succes. Fejl bliver til en dansk fejlbesked.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ActionMessage | null>(null);

  async function run(action: () => Promise<string | void>): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ tone: "success", text });
      return true;
    } catch (e) {
      setMessage({ tone: "danger", text: apiErrorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const fail = (text: string) => setMessage({ tone: "danger", text });

  return { busy, message, run, fail, clear: () => setMessage(null) };
}
