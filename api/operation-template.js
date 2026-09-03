import { createClient } from '@supabase/supabase-js';

export const config={api:{bodyParser:false}};
const BUCKET='operation-documents';
const TEMPLATE_PATH='templates/HE_OPERATION_MASTER.xlsx';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function readBody(req){
  const chunks=[];
  for await(const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function authAdmin(req){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw Object.assign(new Error('Faltan variables privadas de Supabase.'),{status:500});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user) throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('role,is_active').eq('id',data.user.id).single();
  if(!profile?.is_active) throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  if(!['admin','manager'].includes(String(profile.role))) throw Object.assign(new Error('Solo administración puede reemplazar la plantilla maestra.'),{status:403});
  return {admin,user:data.user};
}

export default async function handler(req,res){
  try{
    const {admin}=await authAdmin(req);
    if(req.method==='GET'){
      const {data,error}=await admin.storage.from(BUCKET).list('templates',{search:'HE_OPERATION_MASTER.xlsx',limit:10});
      if(error) throw error;
      const file=(data||[]).find(row=>row.name==='HE_OPERATION_MASTER.xlsx');
      return res.status(200).json({ready:Boolean(file),path:TEMPLATE_PATH,updated_at:file?.updated_at||file?.created_at||null});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});
    const body=await readBody(req);
    if(!body.length) return res.status(400).json({error:'El archivo está vacío.'});
    if(body.length>10*1024*1024) return res.status(413).json({error:'La plantilla supera 10 MB.'});
    if(body[0]!==0x50||body[1]!==0x4b) return res.status(400).json({error:'El archivo no parece ser un XLSX válido.'});
    const {error}=await admin.storage.from(BUCKET).upload(TEMPLATE_PATH,body,{contentType:MIME,upsert:true,cacheControl:'0'});
    if(error) throw error;
    return res.status(200).json({ready:true,path:TEMPLATE_PATH,size:body.length});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.message||'No se pudo gestionar la plantilla operacional.'});
  }
}
