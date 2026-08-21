create or replace function public.public_product_options()
returns table(name text, category text, origin text)
language sql
stable
security definer
set search_path = public
as $$
  select pc.name, pc.category, pc.origin
  from public.product_catalog pc
  where pc.active = true
  order by pc.category, pc.name;
$$;

grant execute on function public.public_product_options() to anon, authenticated;
