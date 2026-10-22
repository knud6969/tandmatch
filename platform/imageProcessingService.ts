import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_DIMENSION } from "@/lib/common/constants/limits";
import { ApiError } from "@/platform/middleware/http";

export type ImageKind = "jpeg" | "png" | "heic";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC_BRANDS = ["heic", "heix", "mif1", "msf1", "heim", "heis", "hevc"];

// Filtype og re-encoding af patientbilleder (architecture 9.3). Ingen tilstand udover konfigurationen.
export class ImageProcessingService {
  constructor(private readonly maxDimension: number = MAX_IMAGE_DIMENSION) {}

  // Kigger på de første bytes (magic bytes). Filtypen fra klienten stoles ikke på.
  detectKind(buf: Buffer): ImageKind | null {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
    if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
    if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
      if (HEIC_BRANDS.includes(buf.subarray(8, 12).toString("ascii"))) return "heic";
    }
    return null;
  }

  // Re-encoder til JPEG. Fjerner EXIF (GPS, enhed) og retter rotation. Max maxDimension px.
  async reencode(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
    if (this.detectKind(buf) === null) {
      throw new ApiError(400, "INVALID_IMAGE", "Billedet skal være JPEG, PNG eller HEIC.");
    }
    try {
      const out = await sharp(buf, { failOn: "error", limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width: this.maxDimension, height: this.maxDimension, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      return { data: out.data, width: out.info.width, height: out.info.height };
    } catch {
      throw new ApiError(400, "INVALID_IMAGE", "Billedet kunne ikke behandles.");
    }
  }
}
