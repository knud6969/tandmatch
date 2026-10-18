"use client";

import type { PatientExportDto } from "@/lib/types/patients";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { useAction } from "@/views/utils/use-action";

// Dataeksport som JSON-fil (GDPR art. 15/20, architecture 10.2). Hentes via API'et og gemmes i browseren.
export function DataExportButton() {
  const action = useAction();

  async function download() {
    await action.run(async () => {
      const data = await apiRequest<PatientExportDto>("/api/patients/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tandmatch-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return "Din fil er hentet.";
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">Hent dine data</h2>
      <p className="text-base text-ink-muted">
        Du får en JSON-fil med dine sager, samtaler, henvendelser, bookinger, anmeldelser og samtykker. Billeder indgår som
        beskrivelser, ikke som filer.
      </p>
      <StatusMessage message={action.message} />
      <div>
        <Button variant="secondary" onClick={download} disabled={action.busy} className="w-full sm:w-fit">
          {action.busy ? "Henter …" : "Hent mine data"}
        </Button>
      </div>
    </Card>
  );
}
