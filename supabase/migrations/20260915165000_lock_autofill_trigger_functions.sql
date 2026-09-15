revoke all on function public.sync_confirmed_service_assignment_autofill() from public;
revoke all on function public.sync_confirmed_service_assignment_autofill() from anon;
revoke all on function public.sync_confirmed_service_assignment_autofill() from authenticated;
revoke all on function public.sync_confirmed_service_assignment_autofill() from service_role;

revoke all on function public.sync_lead_pickup_to_inherited_assignments() from public;
revoke all on function public.sync_lead_pickup_to_inherited_assignments() from anon;
revoke all on function public.sync_lead_pickup_to_inherited_assignments() from authenticated;
revoke all on function public.sync_lead_pickup_to_inherited_assignments() from service_role;

revoke all on function public.sync_lead_nationality_to_inherited_passengers() from public;
revoke all on function public.sync_lead_nationality_to_inherited_passengers() from anon;
revoke all on function public.sync_lead_nationality_to_inherited_passengers() from authenticated;
revoke all on function public.sync_lead_nationality_to_inherited_passengers() from service_role;

revoke all on function public.autofill_passenger_shared_fields() from public;
revoke all on function public.autofill_passenger_shared_fields() from anon;
revoke all on function public.autofill_passenger_shared_fields() from authenticated;
revoke all on function public.autofill_passenger_shared_fields() from service_role;
