import "server-only";
import { BaseStorage } from "@/platform/base/baseStorage";

// Billeder i beskedtråden (features/leads/README.md 10.12). De ligger i den private bucket case-images (som sagsbillederne,
// features/cases/README.md 9.2) under præfikset messages/{lead_id}/{image_id}.jpg: ingen sags- eller patient-id i stien.
// Bruges kun med service role-klienten efter serverens tjek. Signerede URL'er lever kort og logges ikke.
export class MessageImageStorage extends BaseStorage {
  protected readonly bucket = "case-images";

  static pathFor(leadId: string, imageId: string): string {
    return `messages/${leadId}/${imageId}.jpg`;
  }

  // Sletter alle billeder i en tråd (kontosletning).
  removeLead(leadId: string): Promise<void> {
    return this.removePrefix(`messages/${leadId}`);
  }
}
