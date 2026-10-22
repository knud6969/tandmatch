import { CASE_TIMEFRAME_LABEL } from "@/lib/cases/constants/cases";
import { CLINIC_LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { ClinicLeadListItemDto } from "@/lib/leads/types/leads";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatKm, formatShortDateTime } from "@/platform/ui-utils/format";
import { LEAD_STATUS_TONE } from "@/features/leads/utils/lead-status";

// Fælles for indbakkens rækker og lead-kortet: det klinikken skal bruge for at vurdere en henvendelse. Ingen patientidentitet.

export function leadAreaText(lead: Pick<ClinicLeadListItemDto, "area">): string | null {
  const text = [lead.area.postalCode, lead.area.city].filter(Boolean).join(" ");
  return text === "" ? null : text;
}

export function leadDistanceText(lead: Pick<ClinicLeadListItemDto, "distanceKm">): string | null {
  return lead.distanceKm === null ? null : `${formatKm(lead.distanceKm)} fra klinikken`;
}

// Den rene tid: akut-leads har en konkret ønsket tid; øvrige har et tidsrum. Præfikset ("Ønsker tid") sættes af den, der viser den.
export function leadTimeText(lead: Pick<ClinicLeadListItemDto, "requestedStartsAt" | "preferredTimeframe">): string | null {
  if (lead.requestedStartsAt) return formatShortDateTime(lead.requestedStartsAt);
  return lead.preferredTimeframe ? CASE_TIMEFRAME_LABEL[lead.preferredTimeframe] : null;
}

export function leadImagesText(count: number): string | null {
  if (count <= 0) return null;
  return formatCount(count, "billede", "billeder");
}

// "Ny" = klinikken har ikke åbnet leadet endnu.
function isNewLead(lead: Pick<ClinicLeadListItemDto, "seenAt" | "status">): boolean {
  return lead.seenAt === null && lead.status !== "withdrawn";
}

export function LeadBadges({ lead }: { lead: ClinicLeadListItemDto }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={LEAD_STATUS_TONE[lead.status]}>{CLINIC_LEAD_STATUS_LABEL[lead.status]}</Badge>
      {lead.isEmergency && <Badge tone="danger">Akut</Badge>}
      {isNewLead(lead) && <Badge tone="brand">Ny</Badge>}
      {lead.unreadMessages > 0 && (
        <Badge tone="brand">
          {formatCount(lead.unreadMessages, "ulæst besked", "ulæste beskeder")}
        </Badge>
      )}
    </div>
  );
}
