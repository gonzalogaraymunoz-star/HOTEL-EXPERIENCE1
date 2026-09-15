import React,{useState} from 'react';
import {FileSpreadsheet,LoaderCircle} from 'lucide-react';
import type {LeadService} from '../types';
import {assertSupabase} from '../lib/supabase';

export default function PrefilledOperationListButton({service}:{service:LeadService}){
  const [loading,setLoading]=useState(false);
  const departureId=(service as any).departure_id as string|undefined|null;

  const open=async()=>{
    if(!departureId){
      alert('Este servicio todavía no está vinculado a un código TOUR. Asigna la salida antes de generar listas para no crear duplicados.');
      return;
    }
    const target=window.open('about:blank','_blank');
    setLoading(true);
    try{
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
      if(target){target.location.href=body.url;}else{window.open(body.url,'_blank','noopener,noreferrer');}
      if(Array.isArray(body.warnings)&&body.warnings.length)console.warn('Validaciones listas prellenadas',body.warnings);
    }catch(error:any){
      if(target)target.close();
      alert(error?.message||'No se pudieron abrir las listas prellenadas.');
    }finally{setLoading(false)}
  };

  return <button type="button" onClick={()=>void open()} disabled={loading} title={departureId?'Regenera y abre la única lista vigente de esta salida':'Primero vincula el servicio a una salida TOUR'}>
    {loading?<LoaderCircle size={16} className="spin"/>:<FileSpreadsheet size={16}/>} {loading?'Preparando listas…':'Listas prellenadas'}
  </button>;
}
