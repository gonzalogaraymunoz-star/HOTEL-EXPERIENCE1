export default function handler(_req,res){
  const supabaseUrl=Boolean(process.env.SUPABASE_URL);
  const serviceRole=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseConfigured=supabaseUrl&&serviceRole;
  const environment=process.env.VERCEL_ENV||process.env.NODE_ENV||'unknown';

  res.status(supabaseConfigured?200:503).json({
    ok:supabaseConfigured,
    app:'hotel-experience',
    version:'7.0.0-migration',
    environment,
    connections:{
      supabase:{configured:supabaseConfigured},
      ai:{configured:Boolean(process.env.AI_CONFIG_SECRET)}
    },
    publicUrlConfigured:Boolean(process.env.APP_PUBLIC_URL||process.env.VERCEL_PROJECT_PRODUCTION_URL)
  });
}
