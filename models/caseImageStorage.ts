import "server-only";
import { CASE_BUCKET } from "@/lib/constants/limits";
import { BaseStorage } from "@/models/base/baseStorage";

// Privat bucket med patientens mundfotos (helbredsdata). Sti: {case_id}/{image_id}.jpg (architecture 9.2).
// Bruges kun med service role-klienten. Signerede URL'er lever kort (SIGNED_URL_TTL_SECONDS) og logges ikke.
export class CaseImageStorage extends BaseStorage {
  protected readonly bucket = CASE_BUCKET;

  static pathFor(caseId: string, imageId: string): string {
    return `${caseId}/${imageId}.jpg`;
  }

  // Sletter alle billeder på en sag.
  removeCase(caseId: string): Promise<void> {
    return this.removePrefix(caseId);
  }

  // Sletter de angivne billedfiler (fx ved tilbagetrækning af image_upload-samtykke).
  removeImages(paths: string[]): Promise<void> {
    return this.remove(paths);
  }
}
