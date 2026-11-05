import { z } from "zod";

// ISO-tidspunkt med tidszone, brugt af tidsvinduer og starttider i API'et.
export const isoDateTime = z.iso.datetime({ offset: true, message: "Angiv et gyldigt tidspunkt." });
