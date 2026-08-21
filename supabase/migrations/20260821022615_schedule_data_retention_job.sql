create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'monthly-data-retention',
  '0 5 1 * *', -- el día 1 de cada mes a las 05:00 UTC
  $$ select public.apply_data_retention_policy(); $$
);
