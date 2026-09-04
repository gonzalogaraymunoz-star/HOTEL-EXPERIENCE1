import { jsPDF } from 'jspdf';
import type { Lead, LeadService, Passenger } from '../types';

export type CatalogHint = {
  id: string;
  duration_hours?: number | null;
  schedule?: string | null;
};

export type ItineraryRow = {
  id: string;
  day: number;
  date: string;
  schedule: string;
  pickup: string;
  experience: string;
  modality: string;
  serviceCode: string;
  note: string;
};

export type CustomerItineraryInput = {
  lead: Lead;
  passengers: Passenger[];
  services: LeadService[];
  catalog?: CatalogHint[];
};

const BLACK=[18,18,18] as [number,number,number];
const MUTED=[103,99,93] as [number,number,number];
const LINE=[221,217,210] as [number,number,number];
const PAPER=[249,248,245] as [number,number,number];

export function itineraryRows(input:CustomerItineraryInput):ItineraryRow[]{
  const catalogMap=new Map((input.catalog||[]).map(item=>[item.id,item]));
  const sorted=[...input.services].filter(s=>s.fecha_servicio).sort((a,b)=>`${a.fecha_servicio||'9999'} ${a.hora_inicio||''}`.localeCompare(`${b.fecha_servicio||'9999'} ${b.hora_inicio||''}`));
  return sorted.map((service,index)=>{
    const hint=service.product_catalog_id?catalogMap.get(service.product_catalog_id):undefined;
    return {
      id:service.id,
      day:index+1,
      date:formatDate(service.fecha_servicio),
      schedule:serviceSchedule(service,hint),
      pickup:pickupWindow(service),
      experience:service.producto,
      modality:humanModality(service.modality),
      serviceCode:service.service_code||service.tour_id||'—',
      note:String(service.observacion||service.other_notes||'').trim(),
    };
  });
}

export function humanModality(value?:string|null){
  const key=String(value||'').toLowerCase().replace(/[ _-]+/g,'');
  if(key.includes('private')||key.includes('privado'))return'Privado';
  if(key.includes('semi'))return'Semi privado';
  if(key.includes('regular')||key.includes('shared')||key.includes('compart'))return'Regular / compartido';
  if(key.includes('manual')||key.includes('personal'))return'Personalizado';
  return value?String(value):'Por confirmar';
}

export function modalityExplanation(label:string){
  if(label==='Privado')return'Vehículo y ejecución dedicados a la reserva, según lo contratado.';
  if(label==='Semi privado')return'Grupo reducido, con operación compartida bajo cupos controlados.';
  if(label==='Regular / compartido')return'Servicio compartido con otros pasajeros, según salida confirmada.';
  if(label==='Personalizado')return'Condiciones definidas específicamente para esta reserva.';
  return'Modalidad pendiente de confirmación operacional.';
}

export function passengerNames(passengers:Passenger[],lead:Lead){
  const ordered=[...passengers].sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||String(a.passenger_code||'').localeCompare(String(b.passenger_code||'')));
  const names=ordered.map(p=>p.full_name).filter(Boolean);
  return names.length?names:[lead.reserva||lead.codigo];
}

export function pickupPoint(lead:Lead){return lead.pickup_location||lead.empresa_ejecuta||'Por confirmar'}

export function downloadCustomerItinerary(input:CustomerItineraryInput){
  const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
  const rows=itineraryRows(input);
  const names=passengerNames(input.passengers,input.lead);
  const lead=input.lead;
  const pageW=210, margin=15, contentW=180;
  let y=15;

  doc.setTextColor(...BLACK);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('LINK',margin,y);
  doc.setFont('helvetica','normal');doc.setTextColor(...MUTED);doc.text('HOTEL EXPERIENCE',margin+15,y);
  doc.setFont('helvetica','bold');doc.setTextColor(...BLACK);doc.text(lead.codigo||lead.reservation_reference||'RESERVA',pageW-margin,y,{align:'right'});
  y+=9;doc.setDrawColor(...LINE);doc.line(margin,y,pageW-margin,y);y+=9;

  doc.setFont('helvetica','bold');doc.setFontSize(17);doc.setTextColor(...BLACK);doc.text('ITINERARIO',margin,y);
  doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...MUTED);doc.text('Información confirmada desde la misma reserva de LINK Ventas y HOTEL EXPERIENCE.',margin,y+5);
  y+=14;

  doc.setFillColor(...PAPER);doc.roundedRect(margin,y,contentW,24,2,2,'F');
  doc.setFontSize(6.5);doc.setFont('helvetica','bold');doc.setTextColor(...MUTED);doc.text('PASAJEROS',margin+4,y+6);doc.text('HOTEL / ORIGEN',margin+94,y+6);
  doc.setFontSize(8.5);doc.setFont('helvetica','bold');doc.setTextColor(...BLACK);
  const paxLine=doc.splitTextToSize(names.join(' · '),82);doc.text(paxLine,margin+4,y+12);
  doc.text(doc.splitTextToSize(lead.empresa_ejecuta||'Por confirmar',78),margin+94,y+12);
  y+=31;

  const cols=[10,28,34,33,53,22];
  const heads=['DÍA','FECHA','HORARIO','PICKUP EST.','EXPERIENCIA','MODALIDAD'];
  doc.setFillColor(24,24,24);doc.rect(margin,y,contentW,8,'F');
  let x=margin;
  doc.setFont('helvetica','bold');doc.setFontSize(5.8);doc.setTextColor(255,255,255);
  heads.forEach((head,i)=>{doc.text(head,x+2,y+5);x+=cols[i]});
  y+=8;

  doc.setTextColor(...BLACK);
  if(!rows.length){
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Todavía no hay servicios con fecha confirmada.',margin+3,y+9);y+=15;
  }else{
    rows.forEach(row=>{
      const exp=doc.splitTextToSize(row.experience,cols[4]-4);
      const modality=doc.splitTextToSize(row.modality,cols[5]-4);
      const height=Math.max(12,5+Math.max(exp.length,modality.length)*4);
      if(y+height>255){doc.addPage();y=18;}
      doc.setDrawColor(...LINE);doc.line(margin,y+height,pageW-margin,y+height);
      x=margin;doc.setFontSize(7);doc.setFont('helvetica','normal');
      const cells=[String(row.day),row.date,row.schedule,row.pickup];
      cells.forEach((cell,i)=>{doc.text(doc.splitTextToSize(cell,cols[i]-4),x+2,y+5);x+=cols[i]});
      doc.setFont('helvetica','bold');doc.text(exp,x+2,y+5);x+=cols[4];
      doc.setFont('helvetica','normal');doc.text(modality,x+2,y+5);
      y+=height;
    });
  }

  y+=8;
  const tripData=[
    ['Punto de recogida',pickupPoint(lead)],
    ['Vuelo llegada',lead.arrival_flight_number||'No informado'],
    ['Vuelo salida',lead.departure_flight_number||'No informado'],
    ['Habitación',lead.hotel_room||'No informada'],
  ];
  if(y+35>268){doc.addPage();y=18;}
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...BLACK);doc.text('DATOS DE VIAJE',margin,y);y+=5;
  doc.setFillColor(...PAPER);doc.roundedRect(margin,y,contentW,20,2,2,'F');
  tripData.forEach((item,i)=>{const col=i%2,row=Math.floor(i/2);const xx=margin+4+col*90,yy=y+5+row*8;doc.setFontSize(5.8);doc.setFont('helvetica','bold');doc.setTextColor(...MUTED);doc.text(item[0].toUpperCase(),xx,yy);doc.setFontSize(7.3);doc.setFont('helvetica','normal');doc.setTextColor(...BLACK);doc.text(doc.splitTextToSize(item[1],78),xx,yy+3.4)});
  y+=28;

  const modalities=[...new Set(rows.map(r=>r.modality))];
  if(modalities.length){
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('MODALIDADES',margin,y);y+=5;
    modalities.slice(0,3).forEach(label=>{doc.setFontSize(7);doc.setFont('helvetica','bold');doc.text(label,margin,y);doc.setFont('helvetica','normal');doc.setTextColor(...MUTED);doc.text(doc.splitTextToSize(modalityExplanation(label),145),margin+34,y);doc.setTextColor(...BLACK);y+=7;});
  }

  if(y+22>276){doc.addPage();y=18;}
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('RECOMENDACIONES',margin,y);y+=5;
  doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...MUTED);
  const recommendations='Revisa el horario y punto de recogida antes de cada salida. Lleva agua, protección solar, abrigo por capas y documento de identificación cuando corresponda. Los horarios marcados como “Por confirmar” deben ser validados por Operaciones antes del servicio.';
  doc.text(doc.splitTextToSize(recommendations,contentW),margin,y);

  doc.setDrawColor(...LINE);doc.line(margin,286,pageW-margin,286);
  doc.setFontSize(5.8);doc.setTextColor(...MUTED);doc.text('LINK · HOTEL EXPERIENCE',margin,291);doc.text(`Reserva ${lead.codigo||'—'}`,pageW-margin,291,{align:'right'});

  const name=`ITINERARIO_${sanitize(lead.codigo||lead.reservation_reference||lead.reserva||'RESERVA')}.pdf`;
  doc.save(name);return name;
}

export function serviceSchedule(service:LeadService,hint?:CatalogHint){
  const start=String(service.hora_inicio||'').slice(0,5);
  const finish=String(service.hora_fin||'').slice(0,5);
  if(start&&finish)return `${start}–${finish}`;
  const duration=Number(hint?.duration_hours||0);
  if(start&&duration>0){
    const [h,m]=start.split(':').map(Number);const total=h*60+m+Math.round(duration*60);const hh=String(Math.floor((total%(24*60))/60)).padStart(2,'0'),mm=String(total%60).padStart(2,'0');return `${start}–${hh}:${mm}`;
  }
  if(start)return start;
  if(service.duracion_texto)return service.duracion_texto;
  return hint?.schedule||'Por confirmar';
}

export function pickupWindow(service:LeadService){
  const note=String(service.observacion||service.other_notes||'');
  const match=note.match(/(?:pickup|pick\s?up|recogida|retiro)\s*[:\-]?\s*([0-2]?\d:[0-5]\d(?:\s*(?:-|a|–)\s*[0-2]?\d:[0-5]\d)?)/i);
  return match?.[1]||'Por confirmar';
}

export function formatDate(value?:string|null){
  if(!value)return'Por confirmar';const [y,m,d]=String(value).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));
}

function sanitize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'RESERVA'}
