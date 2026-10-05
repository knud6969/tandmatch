// Output-skema for chat (architecture 7.4). AI-flow-agenten ejer prompt og validering.
export type OutOfScopeTopic = "diagnosis" | "severity" | "treatment" | "price";

export type AiChatTurn = {
  reply: string; // max 700 tegn
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean;
};
