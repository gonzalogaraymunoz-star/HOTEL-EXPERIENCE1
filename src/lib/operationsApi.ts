import {assertSupabase} from './supabase';
import type {FulfillmentStatus} from '../types';

export async function loadFoodBoard(date?:string){
  let query=assertSupabase().from('operation_food_board').select('*').order('pickup_time',{ascending:true});
  if(date)query=query.eq('fecha_servicio',date);
  const {data,error}=await query;
  if(error)throw error;
  return data||[];
}

export async function updateResourceFulfillment(id:string,status:FulfillmentStatus|string){
  const {error}=await assertSupabase().from('service_resource_assignments').update({
    fulfillment_status:status,
    updated_at:new Date().toISOString()
  }).eq('id',id);
  if(error)throw error;
}

export async function loadServiceWorkspaceData(leadId:string,serviceId:string){
  const sb=assertSupabase();
  const [passengers,assignment,suppliers,vehicles,people,resources,resourceAssignments,services]=await Promise.all([
    sb.from('passengers').select('*').eq('lead_id',leadId).order('passenger_code'),
    sb.from('service_assignments').select('*').eq('lead_service_id',serviceId).maybeSingle(),
    sb.from('suppliers').select('*').eq('active',true).order('name'),
    sb.from('vehicles').select('*').eq('active',true).order('label'),
    sb.from('service_people').select('*').eq('active',true).order('full_name'),
    sb.from('operational_resources').select('*').eq('active',true).order('resource_type').order('name'),
    sb.from('service_resource_assignments').select('*').eq('lead_service_id',serviceId),
    sb.from('lead_services').select('*').eq('lead_id',leadId).in('booking_status',['confirmed','completed']).order('fecha_servicio').order('hora_inicio')
  ]);
  for(const response of [passengers,assignment,suppliers,vehicles,people,resources,resourceAssignments,services]){
    if(response.error)throw response.error;
  }
  return {
    passengers:passengers.data||[],
    assignment:assignment.data||null,
    suppliers:suppliers.data||[],
    vehicles:vehicles.data||[],
    people:people.data||[],
    resources:resources.data||[],
    resourceAssignments:resourceAssignments.data||[],
    services:services.data||[]
  };
}
