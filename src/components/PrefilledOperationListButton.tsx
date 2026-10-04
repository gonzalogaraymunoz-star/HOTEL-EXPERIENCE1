import React,{useState} from 'react';
import {FileSpreadsheet,LoaderCircle} from 'lucide-react';
import type {LeadService} from '../types';
import {openOrGenerateOperationLists} from '../lib/operationLists';

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
      const body=await openOrGenerateOperationLists(departureId);
      if(!body.url)throw new Error('La lista no tiene enlace disponible.');
      if(target){target.location.href=body.url;}else{window.open(body.url,'_blank','noopener,noreferrer');}
      if(Array.isArray((body as any).warnings)&&(body as any).warnings.length)console.warn('Validaciones listas prellenadas',(body as any).warnings);
    }catch(error:any){
      if(target)target.close();
      alert(error?.message||'No se pudieron abrir las listas prellenadas.');
    }finally{setLoading(false)}
  };

  return <button type="button" onClick={()=>void open()} disabled={loading} title={departureId?'Regenera y abre la única lista vigente de esta salida':'Primero vincula el servicio a una salida TOUR'}>
    {loading?<LoaderCircle size={16} className="spin"/>:<FileSpreadsheet size={16}/>} {loading?'Preparando listas…':'Listas prellenadas'}
  </button>;
}
