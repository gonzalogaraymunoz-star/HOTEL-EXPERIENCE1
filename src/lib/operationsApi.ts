import {assertSupabase} from './supabase';
import type {FulfillmentStatus,Passenger,TourFoodPassenger,TourFoodSegment} from '../types';
import type {FoodType} from './food';

export async function loadFoodBoard(date?:string){
 const sb=assertSupabase();
 let departuresQuery=sb.from('tour_departures').select('*').order('start_time',{ascending:true});
 if(date)departuresQuery=departuresQuery.eq('service_date',date);
 const {data:departures,error:departureError}=await departuresQuery;
 if(departureError)throw departureError;
 const departureIds=(departures||[]).map((item:any)=>item.id);
 if(!departureIds.length)return{departures:[],segments:[],assignments:[]};
 const [{data:segments,error:segmentError},{data:services,error:serviceError}]=await Promise.all([
  sb.from('operation_food_board').select('*').in('departure_id',departureIds),
  sb.from('lead_services').select('departure_id,numero_pax').in('departure_id',departureIds).in('booking_status',['confirmed','completed'])
 ]);
 if(segmentError)throw segmentError;if(serviceError)throw serviceError;
 const segmentIds=(segments||[]).map((item:any)=>item.segment_id).filter(Boolean);
 let assignments:any[]=[];
 if(segmentIds.length){
  const response=await sb.from('tour_food_passengers').select('*').in('segment_id',segmentIds);
  if(response.error)throw response.error;
  assignments=response.data||[];
 }
 const paxByDeparture=new Map<string,number>();
 for(const row of services||[])paxByDeparture.set((row as any).departure_id,(paxByDeparture.get((row as any).departure_id)||0)+Number((row as any).numero_pax||0));
 const activeDepartures=(departures||[]).map((item:any)=>({...item,total_pax:paxByDeparture.get(item.id)||0})).filter((item:any)=>Number(item.total_pax||0)>0);
 const activeIds=new Set(activeDepartures.map((item:any)=>item.id));
 const activeSegments=(segments||[]).filter((item:any)=>activeIds.has(item.departure_id));
 const activeSegmentIds=new Set(activeSegments.map((item:any)=>item.segment_id).filter(Boolean));
 return{departures:activeDepartures,segments:activeSegments,assignments:assignments.filter((item:any)=>activeSegmentIds.has(item.segment_id))};
}
export async function loadDepartureFood(departureId:string){
 const sb=assertSupabase();
 const {data:segments,error}=await sb.from('tour_food_segments').select('*').eq('departure_id',departureId).order('created_at');
 if(error)throw error;
 const ids=(segments||[]).map((item:any)=>item.id);
 if(!ids.length)return{segments:[] as TourFoodSegment[],assignments:[] as TourFoodPassenger[]};
 const {data:assignments,error:assignmentError}=await sb.from('tour_food_passengers').select('*').in('segment_id',ids).order('created_at');
 if(assignmentError)throw assignmentError;
 return{segments:(segments||[]) as TourFoodSegment[],assignments:(assignments||[]) as TourFoodPassenger[]};
}
export async function upsertFoodSegment(departureId:string,foodType:FoodType,patch:Partial<TourFoodSegment>={}){
 const sb=assertSupabase();
 const {data:{user}}=await sb.auth.getUser();
 const payload:any={departure_id:departureId,food_type:foodType,updated_at:new Date().toISOString(),...patch};
 if(!payload.created_by)payload.created_by=user?.id||null;
 const {data,error}=await sb.from('tour_food_segments').upsert(payload,{onConflict:'departure_id,food_type'}).select('*').single();
 if(error)throw error;return data as TourFoodSegment;
}
export async function updateFoodSegment(id:string,patch:Partial<TourFoodSegment>){
 const {data,error}=await assertSupabase().from('tour_food_segments').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
 if(error)throw error;return data as TourFoodSegment;
}
export async function togglePassengerFood(departureId:string,foodType:FoodType,passengerId:string,enabled:boolean){
 const sb=assertSupabase();
 const segment=await upsertFoodSegment(departureId,foodType,{});
 if(enabled){
  const {data:{user}}=await sb.auth.getUser();
  const {data,error}=await sb.from('tour_food_passengers').upsert({segment_id:segment.id,passenger_id:passengerId,quantity:1,created_by:user?.id||null,updated_at:new Date().toISOString()},{onConflict:'segment_id,passenger_id'}).select('*').single();
  if(error)throw error;return data as TourFoodPassenger;
 }
 const {error}=await sb.from('tour_food_passengers').delete().eq('segment_id',segment.id).eq('passenger_id',passengerId);
 if(error)throw error;return null;
}
export async function updateResourceFulfillment(id:string,status:FulfillmentStatus|string){const sb=assertSupabase();const first=await sb.from('tour_departure_resources').update({fulfillment_status:status,updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();if(first.error)throw first.error;if(first.data)return;const {error}=await sb.from('service_resource_assignments').update({fulfillment_status:status,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error}
type PassengerOperationalPatch=Partial<Pick<Passenger,'full_name'|'email'|'phone'|'nationality'|'document_type'|'document_number'|'birth_date'|'dietary_restrictions'|'medical_notes'|'disability_type'>>;
export async function updatePassengerOperationalData(id:string,patch:PassengerOperationalPatch){const payload:Record<string,string|null>={};for(const [key,value] of Object.entries(patch)){if(value===undefined)continue;payload[key]=typeof value==='string'?(value.trim()||null):value as any}const {data,error}=await assertSupabase().from('passengers').update({...payload,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();if(error)throw error;return data as Passenger}
export async function loadServiceWorkspaceData(leadId:string,serviceId:string){
 const sb=assertSupabase();const requested=await sb.from('lead_services').select('*').eq('id',serviceId).single();if(requested.error)throw requested.error;const departureId=(requested.data as any).departure_id as string|null;
 const [departure,departureServices,suppliers,vehicles,people,resources]=await Promise.all([
  departureId?sb.from('tour_departures').select('*').eq('id',departureId).maybeSingle():Promise.resolve({data:null,error:null} as any),
  departureId?sb.from('lead_services').select('*').eq('departure_id',departureId).in('booking_status',['confirmed','completed']).order('created_at'):sb.from('lead_services').select('*').eq('id',serviceId),
  sb.from('suppliers').select('*').eq('active',true).order('name'),sb.from('vehicles').select('*').eq('active',true).order('label'),sb.from('service_people').select('*').eq('active',true).order('full_name'),sb.from('operational_resources').select('*').eq('active',true).order('resource_type').order('name')
 ]);for(const response of [departure,departureServices,suppliers,vehicles,people,resources])if(response.error)throw response.error;
 const groupedServices=(departureServices.data||[]) as any[],serviceIds=groupedServices.map(item=>item.id),leadIds=Array.from(new Set(groupedServices.map(item=>item.lead_id))) as string[];if(!leadIds.length)leadIds.push(leadId);
 const [passengers,links,assignments,departureResources,legacyResources,reservationLeads,itineraryServices,documents,notes]=await Promise.all([
  sb.from('passengers').select('*').in('lead_id',leadIds).order('passenger_code'),serviceIds.length?sb.from('lead_service_passengers').select('*').in('lead_service_id',serviceIds):Promise.resolve({data:[],error:null} as any),serviceIds.length?sb.from('service_assignments').select('*').in('lead_service_id',serviceIds).order('created_at'):Promise.resolve({data:[],error:null} as any),departureId?sb.from('tour_departure_resources').select('*').eq('departure_id',departureId):Promise.resolve({data:[],error:null} as any),!departureId?sb.from('service_resource_assignments').select('*').eq('lead_service_id',serviceId):Promise.resolve({data:[],error:null} as any),sb.from('leads').select('*').in('id',leadIds),sb.from('lead_services').select('*').in('lead_id',leadIds).in('booking_status',['confirmed','completed']).order('fecha_servicio').order('hora_inicio'),sb.from('reservation_documents').select('*').in('lead_id',leadIds),departureId?sb.from('tour_departure_notes').select('*').eq('departure_id',departureId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null} as any)
 ]);for(const response of [passengers,links,assignments,departureResources,legacyResources,reservationLeads,itineraryServices,documents,notes])if(response.error)throw response.error;
 const assignmentRows=(assignments.data||[]) as any[],assignment=assignmentRows[0]||null,assignmentServiceId=assignment?.lead_service_id||groupedServices[0]?.id||serviceId;
 let foodSegments:any[]=[];let foodPassengerAssignments:any[]=[];
 if(departureId){
  const food=await sb.from('tour_food_segments').select('*').eq('departure_id',departureId).order('created_at');
  if(food.error)throw food.error;foodSegments=food.data||[];
  const foodIds=foodSegments.map(item=>item.id);
  if(foodIds.length){
   const foodAssignments=await sb.from('tour_food_passengers').select('*').in('segment_id',foodIds).order('created_at');
   if(foodAssignments.error)throw foodAssignments.error;foodPassengerAssignments=foodAssignments.data||[];
  }
 }
 return{passengers:passengers.data||[],passengerLinks:links.data||[],assignment,assignmentServiceId,suppliers:suppliers.data||[],vehicles:vehicles.data||[],people:people.data||[],resources:resources.data||[],resourceAssignments:departureId?(departureResources.data||[]):(legacyResources.data||[]),departure:departure.data||null,departureServices:groupedServices,reservationLeads:reservationLeads.data||[],itineraryServices:itineraryServices.data||[],documents:documents.data||[],notes:notes.data||[],foodSegments,foodPassengerAssignments};
}
export async function updateTourDeparture(id:string,patch:Record<string,unknown>){const {data,error}=await assertSupabase().from('tour_departures').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();if(error)throw error;return data}
export async function updateDepartureOperationStatus(departureId:string,status:string){const sb=assertSupabase();const {error:servicesError}=await sb.from('lead_services').update({estado_operacion:status,updated_at:new Date().toISOString()}).eq('departure_id',departureId);if(servicesError)throw servicesError;const departureStatus=status==='Completado'?'completed':status==='Cancelado'?'cancelled':'open';const {error}=await sb.from('tour_departures').update({status:departureStatus,updated_at:new Date().toISOString()}).eq('id',departureId);if(error)throw error}
export async function assignResourceToDeparture(departureId:string,resourceId:string,quantity=1,notes=''){const sb=assertSupabase(),{data:{user}}=await sb.auth.getUser();const {data,error}=await sb.from('tour_departure_resources').upsert({departure_id:departureId,resource_id:resourceId,quantity:Math.max(1,Number(quantity||1)),notes:notes.trim()||null,created_by:user?.id||null,updated_at:new Date().toISOString()},{onConflict:'departure_id,resource_id'}).select('*').single();if(error)throw error;return data}
export async function removeResourceFromDeparture(id:string){const {error}=await assertSupabase().from('tour_departure_resources').delete().eq('id',id);if(error)throw error}
export async function addTourDepartureNote(departureId:string,note:string,source:'sales'|'operations'='operations'){const value=note.trim();if(!value)throw new Error('Escribe una nota.');const {data,error}=await assertSupabase().from('tour_departure_notes').insert({departure_id:departureId,note:value,source}).select('*').single();if(error)throw error;return data}
