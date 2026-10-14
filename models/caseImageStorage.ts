import "server-only";
import { BaseStorage } from "@/models/base/baseStorage";

// Privat bucket med patientens mundfotos (helbredsdata). Sti: {case_id}/{image_id}.jpg (architecture 9.2).
// Bruges kun med service role-klienten. Signerede URL'er lever kort (SIGNED_URL_TTL_SECONDS) og logges ikke.
export class CaseImageStorage extends BaseStorage {
  protected readonly bucket = "case-images";

  static pathFor(caseId: string, imageId: string): string {
    return `${caseId}/${imageId}.jpg`;
  }

  // Henter filen (til AI-kaldet, efter ejer- og samtykketjek). Indholdet logges aldrig.
  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.admin.storage.from(this.bucket).download(path);
    if (error || !data) throw new Error("storage: download fejlede");
    return Buffer.from(await data.arrayBuffer());
  }

  // Sletter alle billeder på en sag.
  removeCase(caseId: string): Promise<void> {
    return this.removePrefix(caseId);
  }
}
