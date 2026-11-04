// Push-tokens (identity 4.3 `push_tokens`). Mønstret og loftet skal svare til databasen (SQL: check push_tokens_token_format
// og register_push_token() i supabase/migrations/20261105000100_push_tokens.sql).
export const PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;
export const MAX_PUSH_TOKENS_PER_USER = 5; // (SQL)
export const PUSH_PLATFORMS = ["ios", "android"] as const; // (SQL: check push_tokens_platform_check)
