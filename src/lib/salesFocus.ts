import type {Lead,LeadService} from '../types';

export type SalesFocusBand='high'|'medium'|'low';

export type SalesFocusItem={
  lead:Lead;
  sale:number;
  services:number;
  score:number;
  band:SalesFocusBand;
  visible:boolean;
  daysSinceUpdate:number;
  reasons:string[];
};

const stageWeight:Record<string,number>={
  nuevo:10,
  contactado:20,
  cotizado:35,
  confirmado:45,
  perdido:-100
};

export function rankSalesLeads(leads:Lead[],services:LeadService[]):SalesFocusItem[]{
  const salesByLead=new Map<string,number>();
  const countByLead=new Map<string,number>();
  for(const service of services){
    salesByLead.set(service.lead_id,(salesByLead.get(service.lead_id)||0)+Number(service.precio_venta||0));
    countByLead.set(service.lead_id,(countByLead.get(service.lead_id)||0)+1);
  }
  const maxSale=Math.max(0,...leads.map(l=>salesByLead.get(l.id)||0));
  const now=Date.now();

  return leads.map(lead=>{
    const sale=salesByLead.get(lead.id)||0;
    const serviceCount=countByLead.get(lead.id)||0;
    const stage=String(lead.estado||'nuevo').toLowerCase();
    const updatedAt=new Date(lead.updated_at||lead.created_at).getTime();
    const daysSinceUpdate=Math.max(0,Math.floor((now-updatedAt)/86400000));

    const stageScore=stageWeight[stage]??0;
    const saleScore=maxSale>0?Math.round((sale/maxSale)*40):0;
    const recencyScore=daysSinceUpdate<=3?20:daysSinceUpdate<=7?14:daysSinceUpdate<=14?8:daysSinceUpdate<=30?3:0;
    const priority=String(lead.prioridad||'').toLowerCase();
    const priorityScore=priority==='alta'?8:priority==='media'?4:0;
    const score=Math.max(0,Math.min(100,stageScore+saleScore+recencyScore+priorityScore));

    const reasons:string[]=[];
    if(sale>0)reasons.push(`Venta ${money(sale)}`);
    if(stage==='cotizado')reasons.push('Cotizado');
    if(stage==='confirmado')reasons.push('Confirmado');
    if(daysSinceUpdate<=3)reasons.push('Movimiento reciente');
    else if(daysSinceUpdate<=7)reasons.push('Activo esta semana');
    if(serviceCount>1)reasons.push(`${serviceCount} servicios`);

    const visible=stage!=='perdido'&&(
      score>=30||
      sale>0||
      stage==='cotizado'||
      stage==='confirmado'||
      daysSinceUpdate<=3
    );

    const band:SalesFocusBand=score>=65?'high':score>=40?'medium':'low';
    return {lead,sale,services:serviceCount,score,band,visible,daysSinceUpdate,reasons};
  }).sort((a,b)=>b.score-a.score||b.sale-a.sale||a.daysSinceUpdate-b.daysSinceUpdate);
}

export function focusLabel(band:SalesFocusBand){
  return band==='high'?'Alta':band==='medium'?'Media':'Baja';
}

const money=(n:number)=>new Intl.NumberFormat('es-CL',{
  style:'currency',currency:'CLP',maximumFractionDigits:0
}).format(Number(n||0));
