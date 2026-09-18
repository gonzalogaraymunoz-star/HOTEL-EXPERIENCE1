-- Link the five legacy/manual departures to their canonical catalog products.
-- The departure sync trigger propagates these facts to every child service.

update public.tour_departures d
set
  product_catalog_id = p.id,
  tour_id = p.code,
  product_name = p.name,
  updated_at = now()
from public.product_catalog p
where d.departure_code in ('TOUR-000001','TOUR-000004','TOUR-000005')
  and p.code = 'valle_de_la_luna_regular_commission';

update public.tour_departures d
set
  product_catalog_id = p.id,
  tour_id = p.code,
  product_name = p.name,
  updated_at = now()
from public.product_catalog p
where d.departure_code in ('TOUR-000002','TOUR-000003')
  and p.code = 'geiser_del_tatio_regular_commission';
