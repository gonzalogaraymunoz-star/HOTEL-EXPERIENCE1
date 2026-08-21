import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  Box,CarFront,ChevronRight,Handshake,Search,UserRoundCog,Users,X
} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import './GlobalSearchPortal.css';

type ResultKind='lead'|'service'|'supplier'|'person'|'vehicle'|'resource';
type Result={id:string;kind:ResultKind;title:string;subtitle:string;leadId?:string;nav?:string};

export default function GlobalSearchPortal({
  onLead,onNavigate
}:{onLead:(leadId:string)=>void;onNavigate:(label:string)=>void}){
  const [query,setQuery]=useState('');
  const [open,setOpen]=useState(false);
  const [data,setData]=useState<any>({leads:[],services:[],suppliers:[],people:[],vehicles:[],resources:[]});
  const root=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    let alive=true;
    void (async()=>{
      try{
        const db=assertSupabase();
        const [leads,services,suppliers,people,vehicles,resources]=await Promise.all([
          db.from('leads').select('id,codigo,reserva,contacto,empresa_ejecuta,servicio,lifecycle_stage,checkin,checkout').order('updated_at',{ascending:false}).limit(500),
          db.from('lead_services').select('id,lead_id,producto,tour_id,fecha_servicio,estado_operacion').order('fecha_servicio',{ascending:false}).limit(900),
          db.from('suppliers').select('id,name,supplier_type,contact_name,phone,email').eq('active',true).limit(300),
          db.from('service_people').select('id,full_name,person_type,phone,email,specialties').eq('active',true).limit(350),
          db.from('vehicles').select('id,label,plate,brand,model,driver_name').eq('active',true).limit(300),
          db.from('operational_resources').select('id,name,resource_type,code,location,status').eq('active',true).limit(300)
        ]);
        if(!alive)return;
        setData({
          leads:leads.data||[],services:services.data||[],suppliers:suppliers.data||[],
          people:people.data||[],vehicles:vehicles.data||[],resources:resources.data||[]
        });
      }catch(e){console.error('global search preload',e)}
    })();
    return()=>{alive=false};
  },[]);

  useEffect(()=>{
    const close=(e:MouseEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false)};
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);

  const results=useMemo(()=>{
    const q=norm(query);
    if(q.length<2)return [] as Result[];
    const out:Result[]=[];
    const leadMap=new Map<string,any>(data.leads.map((l:any)=>[l.id,l]));

    for(const l of data.leads){
      if(matches(q,[l.reserva,l.codigo,l.contacto,l.empresa_ejecuta,l.servicio])){
        out.push({
          id:`lead-${l.id}`,kind:'lead',title:l.reserva||'Cliente',leadId:l.id,
          subtitle:`${l.codigo||'Sin código'} · ${life(l.lifecycle_stage)}${l.empresa_ejecuta?` · ${l.empresa_ejecuta}`:''}`
        });
      }
    }
    for(const s of data.services){
      const l=leadMap.get(s.lead_id);
      if(matches(q,[s.producto,s.tour_id,s.fecha_servicio,s.estado_operacion,l?.reserva,l?.codigo])){
        out.push({
          id:`service-${s.id}`,kind:'service',title:s.producto||'Experiencia',leadId:s.lead_id,
          subtitle:`${s.fecha_servicio||'Sin fecha'}${l?` · ${l.reserva} · ${l.codigo}`:''}`
        });
      }
    }
    for(const x of data.suppliers){
      if(matches(q,[x.name,x.supplier_type,x.contact_name,x.phone,x.email]))out.push({
        id:`supplier-${x.id}`,kind:'supplier',title:x.name,nav:'Proveedores',
        subtitle:`Proveedor · ${x.supplier_type||x.contact_name||'Operacional'}`
      });
    }
    for(const x of data.people){
      if(matches(q,[x.full_name,x.person_type,x.phone,x.email,...(x.specialties||[])]))out.push({
        id:`person-${x.id}`,kind:'person',title:x.full_name,nav:'Prestadores',
        subtitle:`Prestador · ${x.person_type||'Sin categoría'}`
      });
    }
    for(const x of data.vehicles){
      if(matches(q,[x.label,x.plate,x.brand,x.model,x.driver_name]))out.push({
        id:`vehicle-${x.id}`,kind:'vehicle',title:x.label||x.plate||'Vehículo',nav:'Vehículos',
        subtitle:`Vehículo · ${[x.brand,x.model,x.plate].filter(Boolean).join(' · ')}`
      });
    }
    for(const x of data.resources){
      if(matches(q,[x.name,x.resource_type,x.code,x.location,x.status]))out.push({
        id:`resource-${x.id}`,kind:'resource',title:x.name,nav:'Insumos',
        subtitle:`Insumo · ${x.resource_type||x.status||'Operacional'}`
      });
    }
    return out.slice(0,14);
  },[query,data]);

  const choose=(r:Result)=>{
    if(r.leadId)onLead(r.leadId);
    else if(r.nav)onNavigate(r.nav);
    setQuery('');
    setOpen(false);
  };

  return <div className="enhanced-global-search" ref={root}>
    <Search size={17}/>
    <input
      value={query}
      onFocus={()=>setOpen(true)}
      onChange={e=>{setQuery(e.target.value);setOpen(true)}}
      onKeyDown={e=>{
        if(e.key==='Escape')setOpen(false);
        if(e.key==='Enter'&&results[0])choose(results[0]);
      }}
      placeholder="Buscar cliente, código, tour, proveedor, patente..."
      aria-label="Búsqueda global"
    />
    {query&&<button className="global-search-clear" onClick={()=>{setQuery('');setOpen(false)}}><X size={14}/></button>}

    {open&&query.trim().length>=2&&<div className="enhanced-global-results">
      <header><strong>Resultados</strong><small>{results.length} coincidencia(s)</small></header>
      {results.map(r=><button key={r.id} onClick={()=>choose(r)}>
        <span className={`global-result-icon ${r.kind}`}>{kindIcon(r.kind)}</span>
        <span><strong>{r.title}</strong><small>{r.subtitle}</small></span>
        <ChevronRight size={15}/>
      </button>)}
      {!results.length&&<div className="global-search-empty">No encontré coincidencias.</div>}
      <footer><span>Enter abre el primero</span><span>Esc cierra</span></footer>
    </div>}
  </div>;
}

function matches(q:string,values:any[]){return norm(values.filter(Boolean).join(' ')).includes(q)}
function norm(v:any){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
function life(stage:any){
  if(stage==='historical')return 'Histórico';
  if(stage==='review')return 'Review';
  if(stage==='dormido')return 'Dormido';
  return 'Oportunidad';
}
function kindIcon(kind:ResultKind){
  if(kind==='lead'||kind==='service')return <Users size={15}/>;
  if(kind==='supplier')return <Handshake size={15}/>;
  if(kind==='person')return <UserRoundCog size={15}/>;
  if(kind==='vehicle')return <CarFront size={15}/>;
  return <Box size={15}/>;
}
