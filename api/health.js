export default function handler(_req,res){
  res.status(200).json({
    ok:true,
    app:'hotel-experience',
    version:'6.0.0',
    serverSupabase:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    aiSecret:Boolean(process.env.AI_CONFIG_SECRET)
  });
}
