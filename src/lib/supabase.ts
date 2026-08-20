import { createClient } from '@supabase/supabase-js';

const PROJECT_URL = 'https://lpirjwifzosdzgdncsbt.supabase.co';
const PROJECT_PUBLISHABLE_KEY = 'sb_publishable_ORe3lY3LRSZo0LMpz4EM9Q_Bf9aUejD';

const url =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  PROJECT_URL;

const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  PROJECT_PUBLISHABLE_KEY;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const supabaseConfigured = Boolean(url && key);

export function assertSupabase() {
  return supabase;
}
