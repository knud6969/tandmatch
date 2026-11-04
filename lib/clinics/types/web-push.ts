// Abonnementet, browseren giver (PushSubscription.toJSON()). Sendes til POST /api/web-push-subscriptions.
export type WebPushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
