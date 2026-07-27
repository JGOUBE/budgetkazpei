begin;

grant select, insert, update
on table
  public.good_deal_businesses,
  public.shopping_store_locations,
  public.shopping_products,
  public.shopping_catalogs,
  public.shopping_promotions,
  public.good_deals
to service_role;

grant select, insert
on table public.shopping_product_aliases
to service_role;

commit;
