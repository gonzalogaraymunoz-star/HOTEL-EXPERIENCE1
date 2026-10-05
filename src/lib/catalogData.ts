import { supabase } from './supabase';

export type CatalogImage = {
  product_slug: string | null;
  title: string;
  storage_path: string;
  image_role: string;
  sort_order: number;
  active: boolean;
  url: string;
};

export type PublicCatalogProduct = {
  product_slug: string;
  name: string;
  category: string;
  duration_hours: number | null;
  schedule: string | null;
  stops: string | null;
  snack: string | null;
  description: string | null;
  public_origin: string | null;
  display_name: string | null;
  altitude: string | null;
  difficulty: string | null;
  minimum_age: string | null;
  duration_label: string | null;
  detail: string | null;
  pickup_location: string | null;
  pickup_time: string | null;
  know_more: string | null;
  itinerary: string[] | null;
  includes: string[] | null;
  excludes: string[] | null;
  recommendations: string[] | null;
  observations: string | null;
  hero: CatalogImage | null;
  cover: CatalogImage | null;
  gallery: CatalogImage[];
};

const complementaryCategories = new Set(['Transporte','SPA / Terapias','Salud','Procedimientos']);
const hiddenPublicVariantSlugs = new Set(['astronomico_a_desierto_abierto','astronomico_en_hotel','astronomico_privado']);

function storageUrl(path:string){
  return supabase.storage.from('catalog-images').getPublicUrl(path).data.publicUrl;
}

async function getImages(slug?:string){
  let query=supabase.from('catalog_images').select('product_slug,title,storage_path,image_role,sort_order,active').eq('active',true).order('sort_order');
  if(slug) query=query.eq('product_slug',slug);
  const {data,error}=await query;
  if(error) throw error;
  return (data||[]).map((image:any)=>({...image,url:storageUrl(image.storage_path)})) as CatalogImage[];
}

function attachImages(product:any,images:CatalogImage[]):PublicCatalogProduct{
  const own=images.filter(image=>image.product_slug===product.product_slug).sort((a,b)=>a.sort_order-b.sort_order);
  const explicitHero=own.find(image=>image.image_role==='hero')||null;
  const legacyCover=own.find(image=>image.image_role==='cover')||null;
  const hero=explicitHero||legacyCover;
  const cover=legacyCover||hero;
  const gallery=own.filter(image=>image.image_role==='gallery'&&image.storage_path!==hero?.storage_path);
  return {...product,hero,cover,gallery};
}

export async function loadPublicCatalog(slug?:string):Promise<PublicCatalogProduct[]>{
  const [{data,error},images]=await Promise.all([
    supabase.rpc('get_public_products',{p_slug:slug||null}),
    getImages(slug)
  ]);
  if(error) throw error;
  return (data||[]).map((product:any)=>attachImages(product,images));
}

export function isPrimaryTourismProduct(product:Pick<PublicCatalogProduct,'category'|'product_slug'>){
  return !complementaryCategories.has(product.category)&&!hiddenPublicVariantSlugs.has(product.product_slug);
}
export function publicGroup(product:Pick<PublicCatalogProduct,'category'>){
  if(product.category==='Nocturno')return'Cielo';
  if(product.category==='Tour día completo')return'Altiplano';
  if(product.category==='Tour medio día')return'Desierto';
  if(product.category==='Transporte')return'Transfers';
  if(product.category==='SPA / Terapias')return'Wellness';
  return product.category;
}
export function publicName(product:Pick<PublicCatalogProduct,'name'|'display_name'>){return product.display_name||product.name}
export function duration(product:Pick<PublicCatalogProduct,'duration_hours'|'duration_label'>){
  if(product.duration_label)return product.duration_label;
  if(!product.duration_hours)return'A coordinar';
  const hours=Number(product.duration_hours);
  return Number.isInteger(hours)?`${hours} h`:`${hours.toFixed(1).replace('.0','')} h`;
}
export function stops(product:Pick<PublicCatalogProduct,'stops'|'itinerary'>){
  if(product.itinerary?.length)return product.itinerary;
  if(!product.stops)return[];
  return product.stops.split(/\s*\+\s*|\s*·\s*|\s*\|\s*/).map(stop=>stop.trim()).filter(Boolean);
}
export const fallbackImage=storageUrl('editorial/01_silencio_ancestral.jpg');
