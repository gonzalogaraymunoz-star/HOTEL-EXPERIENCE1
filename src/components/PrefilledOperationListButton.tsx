import React,{useEffect,useState} from 'react';
import {ExternalLink,FileSpreadsheet,LoaderCircle} from 'lucide-react';
import type {LeadService} from '../types';
import {openOrGenerateOperationLists} from '../lib/operationLists';

export default function PrefilledOperationListButton({service}:{service:LeadService}){
  const departureId=(service as any).departure_id as string|undefined|null;
  const [loading,setLoading]=useState(false);
  const [url,setUrl]=useState<string>('');
  const [error,setError]=useState('');

  const prepare=async(force=false)=>{
    if(!departureId)return null;
    setLoading(true);setError('');
    try{
      const body=await openOrGenerateOperationLists(departureId,force);
      const next=String(body.url||'');
      if(!next)throw new Error('La hoja rellenada no devolvió un enlace.');
      setUrl(next);
      if(Array.isArray((body as any).warnings)&&(body as any).warnings.length)console.warn('Validaciones listas prellenadas',(body as any).warnings);
      return next;
    }catch(error:any){
      setError(error?.message||'No se pudo preparar la hoja rellenada.');
      return null;
    }finally{setLoading(false)}
  };

  useEffect(()=>{
    let active=true;
    if(!departureId)return;
    void openOrGenerateOperationLists(departureId,false)
      .then(body=>{if(active&&body?.url)setUrl(String(body.url));})
      .catch(error=>{if(active)setError(error?.message||'Lista pendiente');});
    return()=>{active=false};
  },[departureId]);

  const open=async()=>{
    if(!departureId){
      alert('Este servicio todavía no está vinculado a un código TOUR. Asigna la salida antes de generar listas.');
      return;
    }
    const target=window.open('about:blank','_blank');
    const destination=url||await prepare(true);
    if(destination){
      if(target)target.location.href=destination;
      else window.open(destination,'_blank','noopener,noreferrer');
    }else if(target)target.close();
  };

  return <button
    type="button"
    onClick={()=>void open()}
    disabled={loading}
    title={url?'Abrir la hoja ya rellenada':error||'La hoja se prepara automáticamente con los pasajeros de la reserva'}
  >
    {loading?<LoaderCircle size={16} className="spin"/>:url?<ExternalLink size={16}/>:<FileSpreadsheet size={16}/>}
    {loading?'Preparando hoja…':url?'Abrir hoja rellenada':'Listas prellenadas'}
  </button>;
}
