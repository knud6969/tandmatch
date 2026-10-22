import type { MESSAGE_SENDER_ROLES } from "@/lib/leads/constants/messages";

// Beskedtråd pr. lead (architecture 4.3 `messages`, 10.12).
export type MessageSenderRole = (typeof MESSAGE_SENDER_ROLES)[number];

// Besked, set fra den, der læser tråden. `fromMe` og `senderRole` afgøres af sender_role, ikke af sender_id, så en besked fra
// en slettet klinikkonto stadig vises som "Klinikken". Klinikken ser aldrig patientens id. `readAt` er modtagerens læsetid.
export type MessageDto = {
  id: string;
  fromMe: boolean;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: string;
  readAt: string | null;
};
