import React,{useEffect,useMemo,useState} from 'react';
import {Calculator,Clock3,MapPinned,Search,Users,Layers3,BusFront,Sparkles} from 'lucide-react';
import {loadProductCatalog} from '../lib/api';
import {internalBase,priceModeLabel,salePriceFor,totalPriceFor,type CatalogProduct} from '../lib/pricing';
import {categoryLabel,modalityInternalLabel,modalityLabel,pricingFamilies,resolveFamilyPrice,type TourModality} from '../lib/tvPricing';

const MODS:TourModality[]=['low','semiprivado','privado'];
const PAX=Array.from({length:12},(_,i)=>i+1);
const EXTRA_CATEGORIES=new Set(['Transporte','Salud','Procedimientos','SPA / Terapias']);

export default function ProductCatalogView({role}:{role:string}){
  const [mode,setMode]=useState<'tours'|'extras'>('tours');
  const [q,setQ]=useState('');
  const [category,setCategory]=useState('Todos');
  const [selectedId,setSelectedId]=useState(pricingFamilies[0]?.id||'');
  const [pax,setPax]=useState(2);
  const [extras,setExtras]=useState<CatalogProduct[]>([]);
  const [extrasLoading,setExtrasLoading]=useState(false);

  useEffect(()=>{
    setExtrasLoading(true);
    loadProductCatalog().then((rows:any[])=>setExtras((rows||[]).filter(x=>EXTRA_CATEGORIES.has(x.category)))).catch(()=>setExtras([])).finally(()=>setExtrasLoading(false));
  },[]);

  const categories=useMemo(()=>['Todos',...Array.from(new Set(pricingFamilies.map(x=>categoryLabel(x.category))))],[]);
  const filtered=useMemo(()=>pricingFamilies.filter(f=>{
    const hay=[f.name,...f.aliases,categoryLabel(f.category),f.origin,f.stops_or_observations].join(' ').toLowerCase();
    return (category==='Todos'||categoryLabel(f.category)===category)&&hay.includes(q.toLowerCase().trim());
  }),[q,category]);
  const selected=pricingFamilies.find(x=>x.id===selectedId)||filtered[0]||pricingFamilies[0]||null;

  return <div className="view-stack pricing-v6">
    <section className="catalog-hero pricing-hero">
      <div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2>Productos, modalidades y precios.</h2><p>Los tours se estandarizan con TV1.2 por <b>tour_id → modalidad → pax</b>. Transporte, wellness y otros servicios conservan el catálogo complementario de Supabase.</p></div>
      <div className="pricing-meta"><span>Fuente tours</span><strong>TV1.2 Fauna Experiencias</strong><small>33 tours · CLP · sin correcciones manuales</small></div>
    </section>

    <div className="catalog-mode-tabs">
      <button className={mode==='tours'?'active':''} onClick={()=>setMode('tours')}><Layers3 size={15}/> Tours TV1.2</button>
      <button className={mode==='extras'?'active':''} onClick={()=>setMode('extras')}><BusFront size={15}/> Transporte & otros servicios</button>
    </div>

    {mode==='tours'?<section className="pricing-workspace">
      <aside className="pricing-browser">
        <div className="pricing-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar experiencia…"/></div>
        <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select>
        <div className="pricing-product-list">
          {filtered.map(f=><button key={f.id} className={selected?.id===f.id?'active':''} onClick={()=>setSelectedId(f.id)}>
            <span><strong>{f.name}</strong><small>{categoryLabel(f.category)}</small></span>
            <em>{MODS.filter(m=>f.modalities[m]?.tariff_found).length}/3</em>
          </button>)}
          {!filtered.length&&<div className="empty-card">No hay productos para este filtro.</div>}
        </div>
      </aside>

      {selected&&<section className="pricing-detail-v6">
        <header className="pricing-product-head">
          <div><span className="eyebrow">{categoryLabel(selected.category)}</span><h2>{selected.name}</h2><p>{selected.stops_or_observations||'Sin descripción operacional.'}</p></div>
          <div className="product-facts">
            <span><Clock3 size={14}/>{durationText(selected.duration)}</span>
            <span><MapPinned size={14}/>{scheduleText(selected.schedule)}</span>
          </div>
        </header>

        <div className="pax-quote-control">
          <div><Calculator size={18}/><span><b>Cotizar tramo</b><small>Selecciona pasajeros para comparar Compartido, Semiprivado y Privado.</small></span></div>
          <div className="pax-stepper">
            <button onClick={()=>setPax(Math.max(1,pax-1))}>−</button><strong>{pax}</strong><span>pax</span><button onClick={()=>setPax(Math.min(12,pax+1))}>+</button>
          </div>
        </div>

        <div className="modality-comparison">
          {MODS.map(m=>{
            const quote=resolveFamilyPrice(selected,m,pax);
            const source=selected.modalitySources[m]||selected.id;
            return <article className={`modality-price-card ${quote.status}`} key={m}>
              <div className="modality-card-head"><span><b>{modalityLabel(m)}</b><small>{modalityInternalLabel(m)}</small></span><i>{statusLabel(quote.status)}</i></div>
              {quote.status==='quoted'?<>
                <strong className="modality-main-price">{money(quote.price_pp_clp)} <small>p/p</small></strong>
                <div className="modality-total"><span>Total {pax} pax</span><b>{money(quote.group_total_clp)}</b></div>
              </>:<div className="manual-price">{quote.status==='manual_quote'?'Cotización manual':'No disponible'}</div>}
              <footer><span>tour_id</span><code>{source}</code></footer>
            </article>
          })}
        </div>

        <div className="pricing-matrix-card">
          <div className="pricing-matrix-head"><div><Layers3 size={17}/><span><b>Tramos completos</b><small>Precio por persona y total del grupo.</small></span></div><span className="mode-chip">1–12 PAX</span></div>
          <div className="pricing-matrix-scroll">
            <table className="pricing-matrix">
              <thead><tr><th>Pax</th>{MODS.map(m=><th key={m}>{modalityLabel(m)}<small>{modalityInternalLabel(m)}</small></th>)}</tr></thead>
              <tbody>{PAX.map(n=><tr className={n===pax?'selected-row':''} key={n} onClick={()=>setPax(n)}>
                <td><b>{n}</b></td>
                {MODS.map(m=><td key={m}><PriceCell quote={resolveFamilyPrice(selected,m,n)}/></td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="pricing-source-note"><Users size={15}/><span>Compartido (LOW) es p/p × pax. Semiprivado usa su valor p/p entre 2–10 pax y 1 pax queda manual. Privado usa el tramo exacto; un tramo nulo nunca se inventa.</span></div>
      </section>}
    </section>:<ExtrasCatalog products={extras} loading={extrasLoading} role={role} pax={pax} setPax={setPax}/>}    
  </div>
}

function ExtrasCatalog({products,loading,role,pax,setPax}:{products:CatalogProduct[];loading:boolean;role:string;pax:number;setPax:(n:number)=>void}){
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('Todos');
  const cats=['Todos',...Array.from(new Set(products.map(p=>p.category)))];
  const filtered=products.filter(p=>(category==='Todos'||p.category===category)&&[p.name,p.category,p.origin,p.code].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
  const privileged=role==='admin'||role==='manager';
  return <section className="extras-catalog">
    <div className="extras-toolbar">
      <div className="pricing-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar transporte, wellness…"/></div>
      <select value={category} onChange={e=>setCategory(e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select>
      <div className="pax-stepper small"><button onClick={()=>setPax(Math.max(1,pax-1))}>−</button><strong>{pax}</strong><span>pax</span><button onClick={()=>setPax(Math.min(20,pax+1))}>+</button></div>
    </div>
    {loading?<div className="loading-card">Cargando catálogo complementario…</div>:<div className="extras-grid">
      {filtered.map(p=>{const sale=salePriceFor(p,pax);const total=totalPriceFor(p,pax);const base=internalBase(p);return <article className="extra-product-card" key={p.id}>
        <div className="extra-product-head"><span className="mode-chip">{p.category}</span><small>{p.code}</small></div>
        <h3>{p.name}</h3>
        <p>{p.description||p.stops||p.schedule||'Servicio complementario.'}</p>
        <div className="extra-price"><span>{priceModeLabel(p.price_mode)}</span><strong>{sale.valid?money(sale.price):'Validar tarifa'}</strong><small>{sale.valid?sale.unit:'Sin tarifa automática'}{sale.valid&&total?` · Total ${money(total)}`:''}</small></div>
        {privileged&&base>0&&<div className="internal-reference"><Sparkles size={13}/><span>Base interna</span><b>{money(base)}</b></div>}
      </article>})}
      {!filtered.length&&<div className="empty-card">No hay productos complementarios para este filtro.</div>}
    </div>}
  </section>
}

function PriceCell({quote}:{quote:any}){
  if(quote.status==='not_available')return <span className="matrix-na">—</span>;
  if(quote.status==='manual_quote')return <span className="matrix-manual">Cotizar</span>;
  return <div className="matrix-price"><b>{money(quote.price_pp_clp)}</b><small>Total {money(quote.group_total_clp)}</small></div>;
}
function money(n:any){return n==null?'—':new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n))}
function statusLabel(s:string){return s==='quoted'?'Tarifa encontrada':s==='manual_quote'?'Manual':'No disponible'}
function durationText(d:any){if(d?.hours)return `${d.hours} h`;if(d?.hours_min)return `${d.hours_min}–${d.hours_max} h`;return d?.display?`${d.display} h`:'Duración por validar'}
function scheduleText(s:any){return s?.approx||s?.block||'Horario por definir'}
