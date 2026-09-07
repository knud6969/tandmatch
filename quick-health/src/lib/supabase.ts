import { createClient } from '@supabase/supabase-js';

// TODO: Erstat med jeres egne Supabase credentials
// Opret et projekt på https://supabase.com og find dem under Settings → API
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
