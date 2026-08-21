export type LeadStatus='nuevo'|'contactado'|'cotizado'|'confirmado'|'perdido';
export type PaymentStatus='Pendiente'|'Parcial'|'Pagado'|'Reembolsado';
export type OperationStatus='Pendiente'|'Coordinado'|'En curso'|'Completado'|'Cancelado';
export type TourModality='low'|'semiprivado'|'privado';
export type OperationExecutionMode='direct'|'delegated_full'|'delegated_partial';
export type SupplierCoverageKey='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';

export interface Lead{
  id:string;codigo:string;reserva:string;numero_pax:number;servicio?:string|null;
  precio_venta?:number|null;moneda:string;checkin?:string|null;checkout?:string|null;
  contacto?:string|null;observaciones_cobros?:string|null;propuesta_enviada?:string|null;
  empresa_ejecuta?:string|null;prioridad?:string|null;estado:LeadStatus|string;canal?:string|null;
  created_at:string;updated_at:string;created_by?:string|null;assigned_to?:string|null;assigned_at?:string|null;
}
export interface LeadService{
  id:string;lead_id:string;producto:string;tour_id?:string|null;modality?:TourModality|string|null;
  pricing_status?:'quoted'|'manual_quote'|'not_available'|string|null;price_pp_clp?:number|null;
  pricing_source?:string|null;fecha_servicio?:string|null;numero_pax:number;observacion?:string|null;
  precio_venta?:number|null;moneda:string;estado_pago:PaymentStatus|string;
  estado_operacion:OperationStatus|string;created_at:string;updated_at:string;
}
export interface CRMTask{
  id:string;lead_id?:string|null;title:string;due_date?:string|null;priority:string;status:string;
  assigned_to?:string|null;notes?:string|null;created_at:string;updated_at:string;
}
export interface CRMActivity{
  id:string;lead_id?:string|null;type:string;title:string;body?:string|null;created_by?:string|null;created_at:string;
}
export interface Passenger{
  id:string;lead_id:string;passenger_code:string;full_name:string;email?:string|null;phone?:string|null;
  nationality?:string|null;document_type?:string|null;document_number?:string|null;birth_date?:string|null;
  dietary_restrictions?:string|null;medical_notes?:string|null;app_user_ref?:string|null;is_primary?:boolean;
  created_by?:string|null;created_at:string;updated_at:string;
}
export interface Supplier{
  id:string;name:string;supplier_type:string;contact_name?:string|null;phone?:string|null;whatsapp?:string|null;
  email?:string|null;website?:string|null;rut?:string|null;services_offered?:string|null;
  sernatur_registration?:string|null;permit_number?:string|null;insurance_policy?:string|null;insurance_expiry?:string|null;
  bank_name?:string|null;account_type?:string|null;account_number?:string|null;payment_notes?:string|null;notes?:string|null;
  active:boolean;created_at:string;updated_at:string;
}
export interface ServicePerson{
  id:string;supplier_id?:string|null;full_name:string;person_type:string;phone?:string|null;whatsapp?:string|null;
  email?:string|null;rut?:string|null;nationality?:string|null;languages?:string[]|null;specialties?:string[]|null;
  certifications?:string[]|null;first_aid_expiry?:string|null;license_type?:string|null;license_expiry?:string|null;
  sernatur_registration?:string|null;bank_name?:string|null;account_type?:string|null;account_number?:string|null;
  default_rate?:number|null;payment_notes?:string|null;availability_notes?:string|null;emergency_contact?:string|null;
  notes?:string|null;active:boolean;created_at:string;updated_at:string;
}
export interface Vehicle{
  id:string;supplier_id?:string|null;driver_person_id?:string|null;label:string;plate:string;brand?:string|null;
  model?:string|null;year?:number|null;capacity?:number|null;driver_name?:string|null;driver_phone?:string|null;
  technical_review_expiry?:string|null;circulation_permit_expiry?:string|null;insurance_expiry?:string|null;notes?:string|null;
  active:boolean;created_at:string;updated_at:string;
}
export interface OperationalResource{
  id:string;resource_type:string;name:string;code?:string|null;quantity_total:number;quantity_available:number;
  supplier_id?:string|null;location?:string|null;maintenance_due?:string|null;expiry_date?:string|null;status:string;
  notes?:string|null;active:boolean;created_at:string;updated_at:string;
}
export interface ServiceAssignment{
  id:string;lead_service_id:string;supplier_id?:string|null;vehicle_id?:string|null;guide_person_id?:string|null;
  driver_person_id?:string|null;cook_person_id?:string|null;coordinator_person_id?:string|null;guide_name?:string|null;
  driver_name?:string|null;pickup_time?:string|null;meeting_point?:string|null;supplier_cost?:number|null;
  operation_mode?:OperationExecutionMode|string|null;supplier_coverage?:SupplierCoverageKey[]|string[]|null;
  supplier_payment_status:string;supplier_payment_date?:string|null;notes?:string|null;created_by?:string|null;
  updated_by?:string|null;created_at:string;updated_at:string;
}
export interface ServiceResourceAssignment{
  id:string;lead_service_id:string;resource_id:string;quantity:number;notes?:string|null;created_at:string;updated_at:string;
}
export interface ReservationDocument{
  id:string;lead_id:string;document_type:string;title:string;url?:string|null;status:string;completed_at?:string|null;
  created_by?:string|null;created_at:string;updated_at:string;
}
