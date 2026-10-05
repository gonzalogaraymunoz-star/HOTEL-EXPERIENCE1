import React,{useState} from 'react';
import {Download,LoaderCircle} from 'lucide-react';
import type {LeadService} from '../types';
import {assertSupabase} from '../lib/supabase';

export default function D80OperationListButton({service}:{service:LeadService}){
  const [loading,setLoading]=useState(false);
  const departureId=(service as any).departure_id as string|undefined|null;

  const download=async()=>{
    if(!departureId){
      alert('Este servicio todavía no está vinculado a un código TOUR. Asigna la salida antes de generar el D80.');
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
        body:JSON.stringify({action:'generate_d80',departureId})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'No se pudo generar el D80.');
      if(!body.url)throw new Error('El D80 no tiene enlace de descarga disponible.');
      if(target)target.location.href=body.url;
      else window.open(body.url,'_blank','noopener,noreferrer');
      if(Array.isArray(body.warnings)&&body.warnings.length)console.warn('Validaciones D80',body.warnings);
    }catch(error:any){
      if(target)target.close();
      alert(error?.message||'No se pudo generar el D80.');
    }finally{
      setLoading(false);
    }
  };

  return <button
    type="button"
    onClick={()=>void download()}
    disabled={loading}
    title={departureId?'Generar y descargar D80 autorellenado':'Primero vincula el servicio a una salida TOUR'}
  >
    {loading?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>}
    {loading?'Preparando D80…':'D80'}
  </button>;
}
