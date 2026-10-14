import "server-only";
import { ApiError, consentRequired } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type ImageRow = Pick<Tables<"case_images">, "id" | "case_id" | "storage_path" | "ai_view" | "ai_quality" | "bytes">;

// Billedet, som serveren bruger det. `storagePath` forlader aldrig serveren (ImageDto har kun en signeret URL).
export type CaseImageRecord = {
  id: string;
  caseId: string;
  storagePath: string;
  view: string | null;
  quality: string | null;
  bytes: number;
};

export type NewCaseImage = {
  id: string;
  caseId: string;
  patientId: string;
  consentId: string;
  storagePath: string;
  width: number;
  height: number;
  bytes: number;
};

const IMAGE_COLUMNS = "id, case_id, storage_path, ai_view, ai_quality, bytes";

// Billedrækker (architecture 4.3 `case_images`, 9). Læsning sker med brugerens JWT (RLS: egne billeder). Der er ingen
// skrive-policies; `create` og `delete` kræver service role-klienten (2.3 c), og kalderen har tjekket ejer, kladde og
// samtykke først. Databasetriggeren håndhæver samtykke, loft og kladde som sidste værn.
export class CaseImagesRepository extends BaseRepository<ImageRow, CaseImageRecord> {
  protected toDto(row: ImageRow): CaseImageRecord {
    return {
      id: row.id,
      caseId: row.case_id,
      storagePath: row.storage_path,
      view: row.ai_view,
      quality: row.ai_quality,
      bytes: row.bytes,
    };
  }

  async listForCase(caseId: string): Promise<CaseImageRecord[]> {
    return this.toDtos(
      await this.runList(
        this.db.from("case_images").select(IMAGE_COLUMNS).eq("case_id", caseId).order("created_at", { ascending: true }),
        "case_images: select fejlede",
      ),
    );
  }

  // Billedet på sagen, eller 404.
  async requireInCase(caseId: string, imageId: string): Promise<CaseImageRecord> {
    const row = await this.run(
      this.db.from("case_images").select(IMAGE_COLUMNS).eq("case_id", caseId).eq("id", imageId).maybeSingle(),
      "case_images: select fejlede",
    );
    return this.toDto(this.requireRow(row));
  }

  async create(image: NewCaseImage): Promise<void> {
    await this.run(
      this.db.from("case_images").insert({
        id: image.id,
        case_id: image.caseId,
        patient_id: image.patientId,
        consent_id: image.consentId,
        storage_path: image.storagePath,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
      }),
      "case_images: insert fejlede",
      {
        IMAGE_LIMIT: new ApiError(400, "IMAGE_LIMIT", "Du kan højst uploade 5 billeder pr. sag."),
        STORAGE_LIMIT: new ApiError(
          413,
          "ANON_STORAGE_LIMIT",
          "Der er for mange billeder i din samtale. Opret en konto for at fortsætte.",
        ),
        CONSENT_REQUIRED: consentRequired("Du skal give samtykke til billeder, før du uploader."),
      },
    );
  }

  async delete(imageId: string): Promise<void> {
    await this.run(this.db.from("case_images").delete().eq("id", imageId), "case_images: delete fejlede");
  }
}
