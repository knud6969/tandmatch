import type { RequestStatus } from "@/lib/types/common";
import type { InboxRecipientStatus } from "@/lib/types/dentists";

// Filter og visningsnavne til tandlægens indbakke (architecture 10.6).
export const INBOX_FILTERS: { value: InboxRecipientStatus | "alle"; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "new", label: "Nye" },
  { value: "seen", label: "Set" },
  { value: "responded", label: "Besvaret" },
  { value: "declined", label: "Afvist" },
];

export const RECIPIENT_STATUS_LABEL: Record<InboxRecipientStatus, string> = {
  new: "Ny",
  seen: "Set",
  responded: "Besvaret",
  declined: "Afvist",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Kladde",
  sent: "Sendt",
  closed: "Lukket",
  expired: "Udløbet",
};
