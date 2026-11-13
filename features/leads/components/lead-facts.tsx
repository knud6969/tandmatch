import { CASE_TIMEFRAME_LABEL } from "@/lib/cases/constants/cases";
import { CLINIC_LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { ClinicLeadListItemDto } from "@/lib/leads/types/leads";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatKm, formatPriceRange, formatTime } from "@/lib/common/domain/format";
import { LEAD_STATUS_TONE } from "@/features/leads/utils/lead-status";

// Fælles for indbakkens rækker og lead-kortet: det klinikken skal bruge for at vurdere en henvendelse. Ingen patientidentitet.

function leadAreaText(lead: Pick<ClinicLeadListItemDto, "area">): string | null {
  const text = [lead.area.postalCode, lead.area.city].filter(Boolean).join(" ");
  return text === "" ? null : text;
}

function leadDistanceText(lead: Pick<ClinicLeadListItemDto, "distanceKm">): string | null {
  return lead.distanceKm === null ? null : formatKm(lead.distanceKm);
}

// Den ønskede tid: akut-leads skal have en tid hurtigst muligt (klinikken foreslår den); øvrige har et tidsrum.
function leadTimeText(lead: Pick<ClinicLeadListItemDto, "isEmergency" | "preferredTimeframe">): string | null {
  if (lead.isEmergency) return "Hurtigst muligt";
  return lead.preferredTimeframe ? CASE_TIMEFRAME_LABEL[lead.preferredTimeframe] : null;
}

export function leadImagesText(count: number): string | null {
  if (count <= 0) return null;
  return formatCount(count, "billede", "billeder");
}

function leadListPriceText(lead: Pick<ClinicLeadListItemDto, "listPrice">): string | null {
  return lead.listPrice ? `Listepris ${formatPriceRange(lead.listPrice.min, lead.listPrice.max)}` : null;
}

// Klinikkens foreslåede akuttid er reserveret, til patienten bekræfter (eller reservationen udløber).
export function leadDeadlineText(holdExpiresAt: string | null): string | null {
  return holdExpiresAt ? `Venter på patienten til kl. ${formatTime(holdExpiresAt)}` : null;
}

// Fakta på én linje: område · afstand · tid · listepris (og evt. mere fra den, der viser dem).
export function leadFactLine(lead: ClinicLeadListItemDto, extra: (string | null)[] = []): string {
  return [leadAreaText(lead), leadDistanceText(lead), leadTimeText(lead), leadListPriceText(lead), ...extra]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

// "Ikke åbnet" = klinikken har ikke åbnet leadet endnu.
function isUnopenedLead(lead: Pick<ClinicLeadListItemDto, "seenAt" | "status">): boolean {
  return lead.seenAt === null && lead.status !== "withdrawn";
}

function UnopenedDot() {
  return (
    <span className="inline-flex items-center" data-testid="ikke-aabnet">
      <span aria-hidden="true" className="size-2.5 rounded-full bg-brand-600" />
      <span className="sr-only">Ikke åbnet</span>
    </span>
  );
}

function DeadlineBadge({ holdExpiresAt }: { holdExpiresAt: string | null }) {
  const text = leadDeadlineText(holdExpiresAt);
  if (!text) return null;
  return (
    <Badge tone="warning">
      <span data-testid="akut-frist">{text}</span>
    </Badge>
  );
}

export function LeadBadges({ lead, showStatus = true }: { lead: ClinicLeadListItemDto; showStatus?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isUnopenedLead(lead) && <UnopenedDot />}
      {showStatus && <Badge tone={LEAD_STATUS_TONE[lead.status]}>{CLINIC_LEAD_STATUS_LABEL[lead.status]}</Badge>}
      {lead.isEmergency && <Badge tone="danger">Akut</Badge>}
      {lead.status === "accepted" && <DeadlineBadge holdExpiresAt={lead.holdExpiresAt} />}
      {lead.unreadMessages > 0 && (
        <Badge tone="brand">{formatCount(lead.unreadMessages, "ulæst besked", "ulæste beskeder")}</Badge>
      )}
    </div>
  );
}
