alter table public.shopping_list_items
  add column if not exists brand text,
  add column if not exists product_url text,
  add column if not exists image_path text,
  add column if not exists external_image_url text,
  add column if not exists retailer_name text,
  add column if not exists current_price numeric(12,2),
  add column if not exists target_price numeric(12,2),
  add column if not exists category text,
  add column if not exists desired_size text,
  add column if not exists desired_color text,
  add column if not exists condition text,
  add column if not exists hardware_color text,
  add column if not exists authenticity_status text,
  add column if not exists seller_marketplace text,
  add column if not exists priority text not null default 'Medium',
  add column if not exists purchased boolean not null default false;

update public.shopping_list_items
set purchased = completed
where completed is true and purchased is false;

alter table public.shopping_list_items
  drop constraint if exists shopping_list_items_current_price_check,
  add constraint shopping_list_items_current_price_check
    check (current_price is null or current_price >= 0),
  drop constraint if exists shopping_list_items_target_price_check,
  add constraint shopping_list_items_target_price_check
    check (target_price is null or target_price >= 0),
  drop constraint if exists shopping_list_items_priority_check,
  add constraint shopping_list_items_priority_check
    check (priority in ('High', 'Medium', 'Low')),
  drop constraint if exists shopping_list_items_product_url_check,
  add constraint shopping_list_items_product_url_check
    check (product_url is null or product_url ~* '^https?://'),
  drop constraint if exists shopping_list_items_external_image_url_check,
  add constraint shopping_list_items_external_image_url_check
    check (external_image_url is null or external_image_url ~* '^https?://');

create index if not exists shopping_list_items_user_created_idx
  on public.shopping_list_items (user_id, created_at desc);
create index if not exists shopping_list_items_user_filters_idx
  on public.shopping_list_items (user_id, purchased, priority, category);

comment on column public.shopping_list_items.image_path is
  'Private clothing-photos bucket object path: {user_id}/shopping-list/{item_id}/{filename}.';

-- RLS remains enabled and the existing shopping_list_items ownership policies
-- continue to restrict every operation to user_id = auth.uid().
-- The existing private clothing-photos policies restrict the first path segment
-- to auth.uid(), which also secures shopping-list images at the path above.
