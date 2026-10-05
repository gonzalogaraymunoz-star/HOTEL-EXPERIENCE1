import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { duration, fallbackImage, isPrimaryTourismProduct, loadPublicCatalog, publicGroup, publicName, stops, type PublicCatalogProduct } from '../lib/catalogData';
import './NeutralCatalogPage.css';

export default function NeutralCatalogPage(){
  const path=window.location.pathname.replace(/\/+$/,'');
  const slug=path.startsWith('/catalogo/')?decodeURIComponent(path.slice('/catalogo/'.length)):'';
  return slug?<CatalogDetail slug={slug}/>:<CatalogIndex/>;
}

function CatalogIndex(){
  const [products,setProducts]=useState<PublicCatalogProduct[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('Todos');

  useEffect(()=>{void loadPublicCatalog().then(data=>setProducts(data.filter(isPrimaryTourismProduct))).catch(e=>setError(e?.message||'No se pudo cargar el catálogo.')).finally(()=>setLoading(false))},[]);

  const categories=useMemo(()=>['Todos',...Array.from(new Set(products.map(publicGroup))).sort()],[products]);
  const filtered=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase('es');
    return products.filter(product=>{
      const group=publicGroup(product);
      const text=`${publicName(product)} ${product.detail||product.description||''} ${product.know_more||''} ${product.stops||''} ${group}`.toLocaleLowerCase('es');
      return (category==='Todos'||group===category)&&(!term||text.includes(term));
    });
  },[products,search,category]);

  return <main className="he-catalog">
    <section className="he-catalog-hero">
      <div className="he-catalog-eyebrow">CATÁLOGO · SAN PEDRO DE ATACAMA</div>
      <h1>Elige una experiencia.<br/>Revisa su ficha.</h1>
      <p>{products.length||'—'} experiencias conectadas al catálogo central para revisar contenido, recorrido, duración e imágenes.</p>
    </section>

    <section className="he-catalog-tools">
      <label className="he-catalog-search"><Search size={20}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar una experiencia"/></label>
      <div className="he-catalog-filters">{categories.map(item=><button key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}</button>)}</div>
    </section>

    <section className="he-catalog-list">
      {loading&&<div className="he-catalog-state">Cargando catálogo…</div>}
      {error&&<div className="he-catalog-state error">{error}</div>}
      {!loading&&!error&&<>
        <div className="he-catalog-count">{filtered.length} experiencias turísticas</div>
        <div className="he-experience-grid">{filtered.map(product=><ExperienceCard key={product.product_slug} product={product}/>)}</div>
      </>}
    </section>
  </main>;
}

function ExperienceCard({product}:{product:PublicCatalogProduct}){
  const name=publicName(product);
  return <a href={`/catalogo/${encodeURIComponent(product.product_slug)}`} className="he-experience-card">
    <div className="he-card-image-wrap"><img src={product.hero?.url||fallbackImage} alt={name}/></div>
    <div className="he-card-body">
      <div className="he-catalog-eyebrow">{publicGroup(product)}</div>
      <h2>{name}</h2>
      <p>{product.detail||product.description||'Experiencia disponible en San Pedro de Atacama.'}</p>
      <span>Conocer experiencia ↗</span>
    </div>
  </a>;
}

function CatalogDetail({slug}:{slug:string}){
  const [product,setProduct]=useState<PublicCatalogProduct|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{void loadPublicCatalog(slug).then(data=>setProduct(data[0]||null)).catch(e=>setError(e?.message||'No se pudo cargar la ficha.')).finally(()=>setLoading(false))},[slug]);

  if(loading)return <main className="he-catalog"><div className="he-catalog-state">Cargando ficha…</div></main>;
  if(error||!product)return <main className="he-catalog"><div className="he-catalog-state error">{error||'Experiencia no encontrada.'}<a href="/catalogo">Volver al catálogo</a></div></main>;

  const name=publicName(product);
  const route=stops(product);
  const structured=Boolean(product.altitude||product.difficulty||product.minimum_age||product.detail||product.know_more||product.itinerary?.length||product.includes?.length||product.recommendations?.length);

  return <main className="he-catalog he-catalog-detail">
    <section className="he-product-hero">
      <img src={product.hero?.url||fallbackImage} alt={name}/>
      <div className="he-product-shade"/>
      <div className="he-product-title">
        <div className="he-catalog-eyebrow light">{publicGroup(product)} · San Pedro de Atacama</div>
        <h1>{name}</h1>
        <p>{product.detail||product.description||'Experiencia disponible en San Pedro de Atacama.'}</p>
      </div>
    </section>

    <section className="he-product-layout">
      <div className="he-product-main">
        {structured?<div className="he-product-facts four">
          <Fact label="Altitud" value={product.altitude||'Por confirmar'}/>
          <Fact label="Dificultad" value={product.difficulty||'Por confirmar'}/>
          <Fact label="Edad" value={product.minimum_age||'Por confirmar'}/>
          <Fact label="Duración" value={duration(product)}/>
        </div>:<div className="he-product-facts">
          <Fact label="Duración" value={duration(product)}/><Fact label="Horario" value={product.schedule||'A coordinar'}/><Fact label="Formato" value={product.public_origin||'Operación local'}/>
        </div>}

        {product.detail&&<Block eyebrow="Detalle" title="La experiencia"><p className="he-body-copy">{product.detail}</p>{(product.pickup_location||product.pickup_time)&&<ul className="he-clean-list">{product.pickup_location&&<li><strong>Lugar de recogida:</strong> {product.pickup_location}</li>}{product.pickup_time&&<li><strong>Hora de recogida:</strong> {product.pickup_time}</li>}</ul>}</Block>}
        {product.know_more&&<Block eyebrow="Conoce más" title="El lugar"><p className="he-body-copy">{product.know_more}</p></Block>}
        {route.length>0&&<Block eyebrow="Itinerario" title="La ruta"><ol className="he-timeline">{route.map((stop,index)=><li key={`${stop}-${index}`}><span>{String(index+1).padStart(2,'0')}</span><p>{stop}</p></li>)}</ol></Block>}

        {(product.includes?.length||product.excludes?.length||product.recommendations?.length)?<div className="he-content-grid">
          <Block eyebrow="Servicio" title="Qué incluye"><ul className="he-clean-list">{(product.includes||[]).map(item=><li key={item}>{item}</li>)}</ul>{product.excludes?.length?<><div className="he-catalog-eyebrow sub">No incluye</div><ul className="he-clean-list">{product.excludes.map(item=><li key={item}>{item}</li>)}</ul></>:null}</Block>
          <Block eyebrow="Recomendaciones" title="Antes de salir"><ul className="he-clean-list">{(product.recommendations||[]).map(item=><li key={item}>{item}</li>)}</ul></Block>
        </div>:<div className="he-content-grid"><Block eyebrow="Experiencia" title="Qué vas a vivir"><p className="he-body-copy">{product.description||'El detalle operativo se confirma antes de la salida.'}</p></Block><Block eyebrow="Servicio" title="Coordinación"><ul className="he-clean-list"><li>Coordinación previa</li>{product.snack&&<li>{product.snack}</li>}<li>Confirmación de horario y condiciones</li></ul></Block></div>}

        {product.gallery.length>0&&<Block eyebrow="Galería" title=""><div className="he-product-gallery">{product.gallery.map(image=><figure key={`${image.storage_path}-${image.sort_order}`}><img src={image.url} alt={image.title}/></figure>)}</div></Block>}

        <div className="he-note-box"><strong>{product.observations?'Observaciones':'Operación en desierto'}</strong><p>{product.observations||'Horarios, accesos y orden de recorrido pueden ajustarse por clima, temporada y condiciones operativas. Los detalles finales se confirman antes de la salida.'}</p></div>
      </div>

      <aside className="he-booking-card">
        <div className="he-catalog-eyebrow">Ficha de catálogo</div>
        <h3>{name}</h3>
        <p>Revisa esta experiencia antes de incorporarla a una propuesta o reserva.</p>
        <a className="he-dark-button" href="/catalogo"><ArrowLeft size={16}/> Volver al catálogo</a>
        <small>Precios, disponibilidad y cierre comercial se gestionan desde LINK Ventas.</small>
      </aside>
    </section>
  </main>;
}

function Fact({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}
function Block({eyebrow,title,children}:{eyebrow:string;title:string;children:any}){return <section className="he-content-block"><div className="he-catalog-eyebrow">{eyebrow}</div>{title&&<h2>{title}</h2>}{children}</section>}
