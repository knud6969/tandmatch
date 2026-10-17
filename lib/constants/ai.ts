// Værdimængder til AI-laget (architecture 7.4, 2.1). Typerne udledes i lib/types/ai.ts, og zod-skemaer og
// JSON-skemaer i services/ai/schemas.ts bruger de samme arrays.

// Emner, AI'en aldrig besvarer. Hvilke der er blokeret, styres af AI_RULES.blockedTopics (services/ai/rules.ts).
export const OUT_OF_SCOPE_TOPICS = ["price", "clinic_recommendation"] as const;

export const IMAGE_VIEWS = ["front", "upper", "lower", "side_left", "side_right", "unclear"] as const;
export const IMAGE_QUALITIES = ["ok", "too_dark", "blurry", "wrong_angle", "not_teeth"] as const;

export const CONVERSATION_STATUSES = ["active", "closed"] as const;
