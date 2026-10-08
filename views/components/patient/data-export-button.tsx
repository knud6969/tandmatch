"use client";

import { useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";

// Henter egne data (GDPR art. 15/20) og gemmer dem som en JSON-fil i browseren. Ingen filgenerering på serveren.
export function DataExportButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const data = await apiRequest<unknown>("/api/patients/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `tandmatch-mine-data-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <Button variant="secondary" onClick={download} disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? "Henter dine data …" : "Download mine data"}
      </Button>
    </div>
  );
}
