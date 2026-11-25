-- CANDIDATE ONLY. Do not apply to production before staging and caller audit.
-- No secret values are included. Provision a random secret in Vault and Worker only.
begin;
create table if not exists private.he_web_intake_receipts (
  request_id uuid primary key references public.leads(id),
  payload_digest bytea not null,
  created_at timestamptz not null default now()
);
revoke all on private.he_web_intake_receipts from public, anon, authenticated;

create or replace function public.he_web_intake_v1(p_secret text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
  v_id uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_pax integer;
  v_arrival date;
  v_departure date;
  v_language text;
  v_mode text;
  v_experiences jsonb;
  v_selection jsonb := '[]'::jsonb;
  v_item jsonb;
  v_slug text;
  v_date date;
  v_digest bytea;
  v_existing bytea;
  v_code text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='he_web_intake_v1_secret' limit 1;
  if v_secret is null or length(v_secret)<32 or p_secret is null
     or pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')) <> pg_catalog.sha256(pg_catalog.convert_to(v_secret,'UTF8')) then
    raise exception 'Unauthorized' using errcode='42501';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16000 then raise exception 'Invalid request' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) as k(key) where key not in ('request_id','name','email','phone','pax','arrival','departure','language','modality','experiences','notes','privacy_accepted')) then raise exception 'Unexpected field' using errcode='22023'; end if;
  v_id := (p_data->>'request_id')::uuid;
  v_name := nullif(btrim(p_data->>'name'),'');
  v_email := nullif(btrim(p_data->>'email'),'');
  v_phone := nullif(btrim(p_data->>'phone'),'');
  v_pax := (p_data->>'pax')::integer;
  v_arrival := (p_data->>'arrival')::date;
  v_departure := (p_data->>'departure')::date;
  v_language := p_data->>'language';
  v_mode := p_data->>'modality';
  v_experiences := p_data->'experiences';
  if v_id is null or v_name is null or length(v_name)>160 or (v_email is null and v_phone is null)
     or coalesce(length(v_email),0)>254 or coalesce(length(v_phone),0)>40
     or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or (v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{7,40}$')
     or v_pax is null or v_pax not between 1 and 100 or v_arrival is null or v_departure is null
     or v_arrival < (now() at time zone 'America/Santiago')::date or v_departure < v_arrival
     or v_departure > v_arrival+90 or v_language is null or v_language not in ('es','en','pt')
     or v_mode is null or v_mode not in ('regular','semiprivado','privado','por_definir')
     or p_data->'privacy_accepted' is distinct from 'true'::jsonb or coalesce(length(p_data->>'notes'),0)>1000
  then raise exception 'Invalid request' using errcode='22023'; end if;
  if v_experiences is null or jsonb_typeof(v_experiences)<>'array' then raise exception 'Invalid experiences' using errcode='22023'; end if;
  if jsonb_array_length(v_experiences) not between 1 and 16 then raise exception 'Invalid experiences' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(v_experiences) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Invalid experience' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) as k(key) where key not in ('slug','date')) then raise exception 'Invalid experience field' using errcode='22023'; end if;
    v_slug := v_item->>'slug';
    v_date := nullif(v_item->>'date','')::date;
    if v_slug is null or length(v_slug)>120 or not exists(select 1 from public.product_catalog where active and product_slug=v_slug)
       or (v_date is not null and (v_date<v_arrival or v_date>v_departure))
    then raise exception 'Invalid experience' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_selection) x where x->>'slug'=v_slug) then raise exception 'Duplicate experience' using errcode='22023'; end if;
    v_selection:=v_selection||jsonb_build_array(jsonb_build_object('slug',v_slug,'date',v_date));
  end loop;
  v_digest:=pg_catalog.sha256(pg_catalog.convert_to(p_data::text,'UTF8'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,0));
  select payload_digest into v_existing from private.he_web_intake_receipts where request_id=v_id;
  if found then
    if v_existing is distinct from v_digest then raise exception 'Request conflict' using errcode='23505'; end if;
    return jsonb_build_object('request_id',v_id,'status','received','replayed',true);
  end if;
  if exists(select 1 from public.leads where id=v_id) then raise exception 'Request conflict' using errcode='23505'; end if;
  v_code:='F360-'||replace(v_id::text,'-','');
  insert into public.leads(id,codigo,reserva,numero_pax,checkin,checkout,contacto,canal,estado,lifecycle_stage,commercial_status,moneda,precio_venta,intake_request)
  values(v_id,v_code,v_code,v_pax,v_arrival,v_departure,coalesce(v_email,v_phone),'website','nuevo','commercial','open','CLP',null,
    jsonb_build_object('experiences',v_selection,'pax',v_pax,'language',v_language,'modality',v_mode,'sourceNote','Hotel Experience · web Atacama','notes',nullif(btrim(p_data->>'notes'),''),'principal_pending',false,'destination','atacama','privacy_accepted',true));
  insert into public.passengers(lead_id,passenger_code,full_name,email,phone,is_primary)
  values(v_id,v_code||'-P01',v_name,v_email,v_phone,true);
  insert into private.he_web_intake_receipts(request_id,payload_digest) values(v_id,v_digest);
  return jsonb_build_object('request_id',v_id,'status','received','replayed',false);
end $$;
revoke all on function public.he_web_intake_v1(text,jsonb) from public, anon, authenticated;
grant execute on function public.he_web_intake_v1(text,jsonb) to anon;
-- Do NOT revoke legacy anon policies blindly here: inventory callers and replace atomically at release.
-- Do NOT publish before preventing bypass through legacy direct INSERT grants.
commit;
