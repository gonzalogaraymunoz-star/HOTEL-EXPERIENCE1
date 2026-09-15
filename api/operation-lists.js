import {createClient} from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import {generateDepartureOperationLists,listDepartureDocumentsForLead} from './_lib/departure-operation-lists.js';

function installExcelJsRangeCompat(){
  const probeBook=new ExcelJS.Workbook();
  const probe=probeBook.addWorksheet('_compat');
  const proto=Object.getPrototypeOf(probe);
  if(typeof proto.getRange==='function')return;
  proto.getRange=function(address){
    const match=String(address).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if(!match)throw new Error(`Rango ExcelJS no soportado: ${address}`);
    const colNumber=(letters)=>String(letters).toUpperCase().split('').reduce((sum,ch)=>sum*26+ch.charCodeAt(0)-64,0);
    const startCol=colNumber(match[1]);const startRow=Number(match[2]);const endCol=colNumber(match[3]);const endRow=Number(match[4]);
    const cells=[];for(let r=startRow;r<=endRow;r++)for(let c=startCol;c<=endCol;c++)cells.push(this.getCell(r,c));
    return{
      set font(value){cells.forEach(cell=>cell.font=value)},
      set fill(value){cells.forEach(cell=>cell.fill=value)},
      set alignment(value){cells.forEach(cell=>cell.alignment=value)},
      set border(value){cells.forEach(cell=>cell.border=value)}
    };
  };
}

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración del servidor incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

async function userFrom(req,admin){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).single();
  if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return{user:data.user,profile};
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    installExcelJsRangeCompat();
    const admin=setup();const {user}=await userFrom(req,admin);const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(body.action==='list_for_lead'){
      if(!body.leadId)return res.status(400).json({error:'Falta leadId.'});
      return res.status(200).json(await listDepartureDocumentsForLead(admin,body.leadId));
    }
    if(body.action==='generate'){
      if(!body.departureId)return res.status(400).json({error:'Falta departureId.'});
      return res.status(200).json(await generateDepartureOperationLists(admin,user,body.departureId));
    }
    return res.status(400).json({error:'Acción no reconocida.'});
  }catch(error){
    console.error('operation-lists',error);
    return res.status(error?.status||500).json({error:error?.message||'No se pudieron generar las listas prellenadas.'});
  }
}
