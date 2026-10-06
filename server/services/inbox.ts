import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxDetailDto, InboxItemDto, InboxRecipientStatus } from "@/lib/types/dentist";
import type { ImageDto } from "@/lib/types/common";
import { QUESTION_LABELS, type QuestionKey } from "@/lib/constants/questions";
import { notFound } from "@/server/http/api";
import { cityByPostalCode, getInboxDetailRow, listInboxRows, listSharedImageRows } from "@/server/models/inbox";
import { signedImageUrl } from "@/server/services/images";
import { requireVerifiedDentist } from "@/server/services/dentists";

// Indbakken viser kun forespørgsler sendt til tandlægen. Ingen patientnavn, kontaktinfo eller chat (architecture 4.4, 10.6).
export async function listInbox(
  supabase: SupabaseClient,
  userId: string,
  status: InboxRecipientStatus | undefined,
): Promise<InboxItemDto[]> {
  await requireVerifiedDentist(supabase, userId);
  const rows = await listInboxRows(supabase, status);
  const cities = await cityByPostalCode(
    supabase,
    rows.map((row) => row.postalCode).filter((code): code is string => code !== null),
  );
  return rows
    .filter((row) => row.postalCode !== null)
    .map((row) => ({
      requestId: row.requestId,
      category: row.category,
      area: { postalCode: row.postalCode as string, city: cities.get(row.postalCode as string) ?? null },
      distanceKm: row.distanceKm,
      imageCount: row.imageCount,
      recipientStatus: row.recipientStatus,
      requestStatus: row.requestStatus,
      sentAt: row.sentAt,
      expiresAt: row.expiresAt,
    }));
}

// Detaljer for én modtaget forespørgsel. Svar med labels, opsummering kun når godkendt, og korte signerede billed-URL'er.
// Ingen patient_id, navn eller kontaktinfo (architecture 4.4). Ikke-modtager og manglende id giver samme 404.
export async function getInboxDetail(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<InboxDetailDto> {
  await requireVerifiedDentist(supabase, userId);
  const record = await getInboxDetailRow(supabase, requestId);
  if (!record) {
    throw notFound();
  }

  const answers = Object.entries(record.answers).flatMap(([key, value]) => {
    const definition = QUESTION_LABELS[key as QuestionKey];
    if (!definition) return [];
    const values = Array.isArray(value) ? value : [value];
    return [
      {
        label: definition.label,
        values: values.map((v) => definition.options[v] ?? v),
      },
    ];
  });

  const images: ImageDto[] = [];
  for (const image of await listSharedImageRows(supabase, requestId)) {
    const url = await signedImageUrl(supabase, image.storagePath);
    if (url) {
      images.push({ id: image.id, url, view: image.view, quality: image.quality });
    }
  }

  return {
    requestId: record.requestId,
    category: record.category,
    area: { postalCode: record.postalCode, city: record.city },
    distanceKm: record.distanceKm,
    status: record.requestStatus,
    sentAt: record.sentAt,
    expiresAt: record.expiresAt,
    summaryText: record.summaryText,
    answers,
    images,
  };
}
