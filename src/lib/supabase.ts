import {createClient} from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL?.trim()||'';
const key=
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()||
  '';

export const supabaseConfigured=Boolean(url&&key);

// createClient requires syntactically valid values at module load time.
// These placeholders never become an operational connection: App.tsx blocks
// the workspace and assertSupabase() throws until the real environment exists.
export const supabase=createClient(
  url||'https://configuration-required.supabase.co',
  key||'configuration-required',
  {
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true
    }
  }
);

export function assertSupabase(){
  if(!supabaseConfigured){
    throw new Error('Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  return supabase;
}
