// Beskedtråd (architecture 10.7). Tråden hænger på ét svar: altid præcis én patient og én tandlæge.
export type MessageDto = {
  id: string;
  fromMe: boolean;
  body: string;
  createdAt: string;
  readAt: string | null;
};
