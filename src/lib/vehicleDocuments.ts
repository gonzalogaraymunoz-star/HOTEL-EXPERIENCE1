export type VehicleDocument={
  id:string;entity_type?:string;entity_id?:string;document_type:string;title:string;
  storage_bucket:string;storage_path:string;file_name:string;mime_type?:string|null;
  size_bytes?:number|null;expires_on?:string|null;notes?:string|null;status:string;
  source_kind?:string|null;external_url?:string|null;external_id?:string|null;
  verification_level?:string|null;source_metadata?:Record<string,any>|null;
  created_at?:string;updated_at?:string;
};

export const vehicleDocumentRequirements=[
  {key:'vehicle_registry',label:'Padrón / inscripción',required:true,expiry:false},
  {key:'circulation_permit',label:'Permiso de circulación',required:true,expiry:true},
  {key:'technical_review',label:'Revisión técnica',required:true,expiry:true},
  {key:'soap',label:'SOAP',required:true,expiry:true},
  {key:'transport_authorization',label:'Autorización de transporte / D80',required:false,expiry:true},
  {key:'insurance',label:'Seguro adicional',required:false,expiry:true},
  {key:'maintenance',label:'Mantenciones',required:false,expiry:false},
  {key:'photos',label:'Fotografías del vehículo',required:false,expiry:false},
  {key:'other',label:'Otros antecedentes',required:false,expiry:false}
] as const;
export type VehicleRequirement=typeof vehicleDocumentRequirements[number];
export type VehicleDocumentState={tone:'ok'|'soon'|'expired'|'review'|'missing';message:string;doc:VehicleDocument|null};

export function hasStoredOperationalFile(doc:Pick<VehicleDocument,'storage_bucket'|'storage_path'>){
  return doc.storage_bucket==='operational-files'&&Boolean(doc.storage_path)&&!/^https?:\/\/|^drive-ref\//i.test(doc.storage_path);
}

export function chileToday(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function vehicleRequirementState(req:VehicleRequirement,documents:VehicleDocument[],today=chileToday()):VehicleDocumentState{
  const matching=documents.filter(d=>d.status==='active'&&d.document_type===req.key);
  const official=matching.filter(d=>(d.verification_level||'official')==='official');
  const current=official.filter(d=>!req.expiry||(Boolean(d.expires_on)&&(d.expires_on||'')>=today));
  const sort=(rows:VehicleDocument[])=>[...rows].sort((a,b)=>String(b.expires_on||b.created_at||'').localeCompare(String(a.expires_on||a.created_at||'')))[0];
  const doc=sort(current)||sort(official)||sort(matching)||null;
  if(!doc)return {tone:'missing',message:'Falta respaldo documental.',doc:null};
  if((doc.verification_level||'official')!=='official')return {tone:'review',message:'Antecedente disponible; falta validar el documento oficial.',doc};
  if(req.expiry&&!doc.expires_on)return {tone:'review',message:'Documento cargado; falta confirmar su vigencia.',doc};
  if(doc.expires_on&&doc.expires_on<today)return {tone:'expired',message:`Vencido el ${vehicleDateFmt(doc.expires_on)}.`,doc};
  if(doc.expires_on){
    const days=Math.round((Date.parse(`${doc.expires_on}T12:00:00Z`)-Date.parse(`${today}T12:00:00Z`))/86400000);
    return {tone:days<=30?'soon':'ok',message:`Vigente hasta ${vehicleDateFmt(doc.expires_on)}${days<=30?' · renovar pronto':''}.`,doc};
  }
  return {tone:'ok',message:'Documento oficial cargado. Conserva la fecha de emisión indicada en el archivo.',doc};
}

export function vehicleDocumentReadiness(documents:VehicleDocument[],active=true,today=chileToday()){
  const required=vehicleDocumentRequirements.filter(r=>r.required);
  const states=required.map(r=>vehicleRequirementState(r,documents,today));
  const ok=states.filter(s=>s.tone==='ok'||s.tone==='soon').length;
  const tone=!active||states.some(s=>s.tone==='expired')?'blocked':ok===required.length?'ready':'review';
  const label=!active?'Fuera de servicio':tone==='blocked'?'Documento vencido':tone==='ready'?'Documentación completa':'Documentación pendiente';
  return {tone,label,ok,total:required.length};
}

export function vehicleDateFmt(date:string){return new Date(`${date}T12:00:00`).toLocaleDateString('es-CL')}
