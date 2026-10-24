import "server-only";
import { ApiError, consentRequired } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";

type ImageRow = Pick<Tables<"case_images">, "id" | "case_id" | "storage_path" | "ai_view" | "ai_quality" | "ai_description" | "bytes" | "created_at" | "ai_turn_at">;

// Billedet, som serveren bruger det. `storagePath` forlader aldrig serveren (ImageDto har kun en signeret URL).
export type CaseImageRecord = {
  id: string;
  caseId: string;
  storagePath: string;
  view: string | null;
  quality: string | null;
  description: string | null;
  bytes: number;
  createdAt: string;
  turnAt: string | null; // sat af reserve_image_turn() (7.9c); null = ikke set i en billedtur endnu
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

const IMAGE_COLUMNS = "id, case_id, storage_path, ai_view, ai_quality, ai_description, bytes, created_at, ai_turn_at";

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
      description: row.ai_description,
      bytes: row.bytes,
      createdAt: row.created_at,
      turnAt: row.ai_turn_at,
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

  // Returnerer upload-tidspunktet (databasens created_at).
  async create(image: NewCaseImage): Promise<string> {
    const row = await this.run<{ created_at: string }>(
      this.db.from("case_images").insert({
        id: image.id,
        case_id: image.caseId,
        patient_id: image.patientId,
        consent_id: image.consentId,
        storage_path: image.storagePath,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
      }).select("created_at").single(),
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
    return this.requireRow(row).created_at;
  }

  // Kun service role (2.3 a, c): AI'ens neutrale beskrivelse af billedet (vinkel, kvalitet, synligt område). Kalderen har
  // tjekket ejer og kladde. Beskrivelsen er en del af opsummeringen, som patienten godkender.
  async saveObservation(
    imageId: string,
    observation: { view: string; quality: string; description: string },
  ): Promise<void> {
    await this.run(
      this.db
        .from("case_images")
        .update({ ai_view: observation.view, ai_quality: observation.quality, ai_description: observation.description })
        .eq("id", imageId),
      "case_images: update fejlede",
    );
  }

  // Kun service role (2.3 a, c). Billedturens resultat (7.9c): kun vinkel og kvalitet, ikke beskrivelsen (den skrives kun af
  // opsummeringen og kræver ny godkendelse). Kalderen har reserveret turen for billederne i sagen.
  async saveTurnObservation(caseId: string, imageId: string, observation: { view: string; quality: string }): Promise<void> {
    await this.run(
      this.db
        .from("case_images")
        .update({ ai_view: observation.view, ai_quality: observation.quality })
        .eq("case_id", caseId)
        .eq("id", imageId),
      "case_images: update fejlede",
    );
  }

  // Kun service role. Fortryder reservationen, så en fejlet billedtur kan gentages.
  async clearTurnMarks(caseId: string, imageIds: readonly string[]): Promise<void> {
    if (imageIds.length === 0) return;
    await this.run(
      this.db.from("case_images").update({ ai_turn_at: null }).eq("case_id", caseId).in("id", [...imageIds]),
      "case_images: update fejlede",
    );
  }

  async delete(imageId: string): Promise<void> {
    await this.run(this.db.from("case_images").delete().eq("id", imageId), "case_images: delete fejlede");
  }
}
