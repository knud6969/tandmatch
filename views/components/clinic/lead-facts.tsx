import { CASE_TIMEFRAME_LABEL } from "@/lib/constants/cases";
import { CLINIC_LEAD_STATUS_LABEL } from "@/lib/constants/leads";
import type { ClinicLeadListItemDto } from "@/lib/types/leads";
import { Badge } from "@/views/components/ui/badge";
import { formatKm, formatShortDateTime } from "@/views/utils/format";

// Fælles for indbakkens rækker og lead-kortet: det klinikken skal bruge for at vurdere en henvendelse. Ingen patientidentitet.

export function leadAreaText(lead: Pick<ClinicLeadListItemDto, "area">): string | null {
  const text = [lead.area.postalCode, lead.area.city].filter(Boolean).join(" ");
  return text === "" ? null : text;
}

export function leadDistanceText(lead: Pick<ClinicLeadListItemDto, "distanceKm">): string | null {
  return lead.distanceKm === null ? null : `${formatKm(lead.distanceKm)} fra klinikken`;
}

// Akut-leads har en konkret ønsket tid; øvrige har et tidsrum.
export function leadTimeText(lead: Pick<ClinicLeadListItemDto, "requestedStartsAt" | "preferredTimeframe">): string | null {
  if (lead.requestedStartsAt) return `Ønsker tid ${formatShortDateTime(lead.requestedStartsAt)}`;
  return lead.preferredTimeframe ? CASE_TIMEFRAME_LABEL[lead.preferredTimeframe] : null;
}

export function leadImagesText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 billede" : `${count} billeder`;
}

// "Ny" = klinikken har ikke åbnet leadet endnu.
export function isNewLead(lead: Pick<ClinicLeadListItemDto, "seenAt" | "status">): boolean {
  return lead.seenAt === null && lead.status !== "withdrawn";
}

export function LeadBadges({ lead }: { lead: ClinicLeadListItemDto }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={lead.status === "sent" ? "warning" : lead.status === "withdrawn" || lead.status === "declined" ? "neutral" : "brand"}>
        {CLINIC_LEAD_STATUS_LABEL[lead.status]}
      </Badge>
      {lead.isEmergency && <Badge tone="warning">Akut</Badge>}
      {isNewLead(lead) && <Badge tone="brand">Ny</Badge>}
      {lead.unreadMessages > 0 && (
        <Badge tone="brand">
          {lead.unreadMessages === 1 ? "1 ulæst besked" : `${lead.unreadMessages} ulæste beskeder`}
        </Badge>
      )}
    </div>
  );
}
