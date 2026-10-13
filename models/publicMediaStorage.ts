import "server-only";
import { BaseStorage } from "@/models/base/baseStorage";
import { getSupabaseConfig } from "@/models/db/config";

const BUCKET = "public-media";

// Offentlig bucket med kliniklogoer, tandlægeportrætter og porteføljebilleder (architecture 9.1, 9.5).
// Filerne kan læses af alle; skrivning og sletning sker kun med service role efter ejertjek (2.3 d).
// Stier: clinics/{clinic_id}/logo.jpg, clinics/{clinic_id}/dentists/{dentist_id}.jpg, clinics/{clinic_id}/portfolio/{item_id}.jpg.
export class PublicMediaStorage extends BaseStorage {
  protected readonly bucket = BUCKET;

  static clinicPrefix(clinicId: string): string {
    return `clinics/${clinicId}`;
  }

  static logoPath(clinicId: string): string {
    return `${PublicMediaStorage.clinicPrefix(clinicId)}/logo.jpg`;
  }

  static dentistPhotoPath(clinicId: string, dentistId: string): string {
    return `${PublicMediaStorage.clinicPrefix(clinicId)}/dentists/${dentistId}.jpg`;
  }

  static portfolioPath(clinicId: string, itemId: string): string {
    return `${PublicMediaStorage.clinicPrefix(clinicId)}/portfolio/${itemId}.jpg`;
  }

  // Den offentlige URL til en fil. Ren strengsammensætning uden netværkskald og uden nøgler. `version` (fx et
  // tidsstempel) tilføjes, så browseren henter filen igen, når et billede erstattes på samme sti.
  static publicUrl(path: string, version?: string | number): string {
    const { url } = getSupabaseConfig();
    const suffix = version === undefined ? "" : `?v=${encodeURIComponent(String(version))}`;
    return `${url}/storage/v1/object/public/${BUCKET}/${path}${suffix}`;
  }

  // Erstatter en fil på en fast sti (logo, tandlægeportræt): den gamle fjernes, den nye lægges i stedet.
  async replace(path: string, data: Buffer | Uint8Array, contentType: string): Promise<void> {
    await this.remove([path]);
    await this.upload(path, data, contentType);
  }

  // Sletter alt, klinikken har liggende (kontosletning, architecture 10.8).
  removeClinic(clinicId: string): Promise<void> {
    return this.removePrefix(PublicMediaStorage.clinicPrefix(clinicId));
  }
}
