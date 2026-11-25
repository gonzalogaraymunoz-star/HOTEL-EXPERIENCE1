-- Minimal public contact capture. Additive, no legacy permission changes.
-- The Worker must verify Turnstile and keep the intake secret server-side.
-- Provision a unique secret in Vault named he_web_interest_v1_secret before granting execution.
create table if not exists private.he_web_interest_receipts (
 request_id uuid primary key references public.leads(id),
 payload_digest bytea not null,
 consent_version text not null check (consent_version='he-contact-v1'),
 created_at timestamptz not null default now()
);
revoke all on private.he_web_interest_receipts from public, anon, authenticated;
create or replace function public.he_web_interest_v1(p_secret text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_secret text; v_id uuid; v_name text; v_email text; v_phone text; v_pax integer;
 v_arrival date; v_departure date; v_lang text; v_interest text;
 v_digest bytea; v_existing bytea; v_code text; v_note text;
begin
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='he_web_interest_v1_secret';
 if v_secret is null or length(v_secret)<32 or p_secret is null
    or pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')) is distinct from pg_catalog.sha256(pg_catalog.convert_to(v_secret,'UTF8'))
 then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000
 then raise exception 'Invalid request' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) as k(key)
 where key not in ('request_id','name','email','phone','destination','arrival','departure','pax','language','interest','consent_version'))
 then raise exception 'Unexpected field' using errcode='22023'; end if;
 v_id:=(p_data->>'request_id')::uuid;
 v_name:=nullif(btrim(p_data->>'name'),'');
 v_email:=nullif(btrim(p_data->>'email'),'');
 v_phone:=nullif(btrim(p_data->>'phone'),'');
 v_pax:=nullif(p_data->>'pax','')::integer;
 v_arrival:=nullif(p_data->>'arrival','')::date;
 v_departure:=nullif(p_data->>'departure','')::date;
 v_lang:=p_data->>'language';
 v_interest:=nullif(btrim(p_data->>'interest'),'');
 if v_id is null or v_name is null or length(v_name)>120
 or (v_email is null and v_phone is null)
 or coalesce(length(v_email),0)>254 or coalesce(length(v_phone),0)>40
 or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 or (v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{7,40}$')
 or (v_pax is not null and v_pax not between 1 and 100)
 or (v_arrival is not null and v_departure is not null and v_departure<v_arrival)
 or v_lang is null or v_lang not in ('es','pt','en')
 or p_data->>'destination' is distinct from 'atacama'
 or v_interest is null or length(v_interest)>500
 or p_data->>'consent_version' is distinct from 'he-contact-v1'
 then raise exception 'Invalid request' using errcode='22023'; end if;
 v_digest:=pg_catalog.sha256(pg_catalog.convert_to(p_data::text,'UTF8'));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,0));
 select payload_digest into v_existing from private.he_web_interest_receipts where request_id=v_id;
 if found then
   if v_existing is distinct from v_digest then raise exception 'Request conflict' using errcode='23505'; end if;
   return jsonb_build_object('request_id',v_id,'status','received','replayed',true);
 end if;
 if exists(select 1 from public.leads where id=v_id) then raise exception 'Request conflict' using errcode='23505'; end if;
 v_code:='F360-'||replace(v_id::text,'-','');
 v_note:='Website Hotel Experience · Atacama · Contacto: '||v_name||
   case when v_email is not null and v_phone is not null then ' · Teléfono: '||v_phone else '' end||
   ' · Fechas y cantidad declaradas, no confirmadas. Contacto aún no identificado como pasajero.';
 insert into public.leads(id,codigo,reserva,numero_pax,checkin,checkout,contacto,canal,estado,lifecycle_stage,commercial_status,moneda,precio_venta,next_best_action,intake_request)
 values(v_id,v_code,v_code,v_pax,v_arrival,v_departure,coalesce(v_email,v_phone),'website','nuevo','commercial','open','CLP',null,'Ventas: revisar interés y asignar responsable',
 jsonb_build_object('product',v_interest,'pax',v_pax,'date',v_arrival,'language',v_lang,'sourceNote',v_note,'principal_pending',true));
 insert into private.he_web_interest_receipts(request_id,payload_digest,consent_version) values(v_id,v_digest,'he-contact-v1');
 return jsonb_build_object('request_id',v_id,'status','received','replayed',false);
end $$;
revoke all on function public.he_web_interest_v1(text,jsonb) from public, anon, authenticated;
-- Grant separately only after security/negative tests and secret provisioning.
