import {assertSupabase} from './supabase';

type ReconcileResult={checked:number;generated:number;failed:number};

async function generateOne(departureId:string){
  const sb=assertSupabase();
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)throw new Error('Sesión requerida.');
  const response=await fetch('/api/operation-lists',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
    body:JSON.stringify({action:'generate',departureId})
  });
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'No se pudieron generar las listas.');
  return body;
}

function isoOffset(days:number){
  const d=new Date();
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

export async function reconcileMissingOperationLists():Promise<ReconcileResult>{
  const sb=assertSupabase();
  const {data,error}=await sb.from('tour_departures')
    .select('id,departure_code,service_date,status,operation_lists_url,operation_lists_status')
    .gte('service_date',isoOffset(-7))
    .lte('service_date',isoOffset(120))
    .neq('status','cancelled')
    .is('operation_lists_url',null)
    .eq('operation_lists_status','pending')
    .order('service_date')
    .order('start_time')
    .limit(30);
  if(error)throw error;
  const rows=data||[];
  let generated=0,failed=0;
  for(let index=0;index<rows.length;index+=2){
    const batch=rows.slice(index,index+2);
    const results=await Promise.allSettled(batch.map(row=>generateOne(row.id)));
    for(const result of results){
      if(result.status==='fulfilled')generated++;
      else failed++;
    }
  }
  return{checked:rows.length,generated,failed};
}

export async function openOrGenerateOperationLists(departureId:string){
  const sb=assertSupabase();
  const {data,error}=await sb.from('tour_departures')
    .select('operation_lists_url,operation_lists_status,operation_lists_error')
    .eq('id',departureId)
    .single();
  if(error)throw error;
  if(data?.operation_lists_url)return{url:data.operation_lists_url,existing:true};
  const body=await generateOne(departureId);
  return{url:body.url||body.spreadsheetUrl,existing:false,warnings:body.warnings||[]};
}
