update storage.buckets
set allowed_mime_types = array(
  select distinct mime
  from unnest(coalesce(allowed_mime_types,'{}'::text[]) || array['application/pdf']::text[]) as mime
)
where id='operation-documents';
