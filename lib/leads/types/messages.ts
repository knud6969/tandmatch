import type { MESSAGE_SENDER_ROLES } from "@/lib/leads/constants/messages";

// Beskedtråd pr. lead (architecture 4.3 `messages`, 10.12).
export type MessageSenderRole = (typeof MESSAGE_SENDER_ROLES)[number];

// Besked, set fra den, der læser tråden. `fromMe` og `senderRole` afgøres af sender_role, ikke af sender_id, så en besked fra
// en slettet klinikkonto stadig vises som "Klinikken". Klinikken ser aldrig patientens id. `readAt` er modtagerens læsetid.
export type MessageDto = {
  id: string;
  fromMe: boolean;
  senderRole: MessageSenderRole;
  body: string; // kan være "" ved en besked med kun billeder
  createdAt: string;
  readAt: string | null;
  images: MessageImageDto[]; // i beskedens rækkefølge; tom liste ved en ren tekstbesked
};

// Billede i en besked (10.12). `url` er signeret og lever 5 minutter (SIGNED_URL_TTL_SECONDS); bredde og højde efter genkodning.
export type MessageImageDto = { id: string; url: string; width: number; height: number };
