import "server-only";
import { BaseStorage } from "@/platform/base/baseStorage";

// Billeder i beskedtråden (features/leads/README.md 10.12). De ligger i den private bucket case-images (som sagsbillederne,
// features/cases/README.md 9.2) under præfikset messages/{lead_id}/{image_id}.jpg: ingen sags- eller patient-id i stien.
// Bruges kun med service role-klienten efter serverens tjek. Signerede URL'er lever kort og logges ikke.
export class MessageImageStorage extends BaseStorage {
  protected readonly bucket = "case-images";

  // Små bogstaver som uuid::text i databasen: send_message_with_images() bygger stien selv af lead- og billed-id'et, så en
  // sti med store bogstaver ville efterlade filen uden for sletningen (kontosletning, tilbagetrukket samtykke).
  static pathFor(leadId: string, imageId: string): string {
    return `messages/${leadId.toLowerCase()}/${imageId.toLowerCase()}.jpg`;
  }

  // Mappen med alle billeder i en tråd (kontosletning).
  static leadPrefix(leadId: string): string {
    return `messages/${leadId.toLowerCase()}`;
  }

  // Sletter alle billeder i en tråd.
  removeLead(leadId: string): Promise<void> {
    return this.removePrefix(MessageImageStorage.leadPrefix(leadId));
  }
}
