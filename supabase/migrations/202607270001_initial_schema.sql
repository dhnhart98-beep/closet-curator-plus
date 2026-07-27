begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.closet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null check (category in ('Top','Bottom','Dress','Outerwear','Shoes','Accessory','Handbag','Beauty','Fragrance')),
  color text,
  brand text,
  season text not null default 'Year-round' check (season in ('Year-round','Spring','Summer','Fall','Winter')),
  occasion text not null default 'Everyday',
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  purchase_date date,
  wear_count integer not null default 0 check (wear_count >= 0),
  favorite boolean not null default false,
  notes text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, photo_path)
);

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.outfit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid not null,
  closet_item_id uuid not null,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  foreign key (outfit_id, user_id)
    references public.outfits(id, user_id) on delete cascade,
  foreign key (closet_item_id, user_id)
    references public.closet_items(id, user_id) on delete cascade,
  unique (outfit_id, closet_item_id)
);

create table public.planner_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid not null,
  planned_for date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outfit_id, user_id)
    references public.outfits(id, user_id) on delete cascade,
  unique (user_id, planned_for)
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index closet_items_user_created_idx on public.closet_items(user_id, created_at desc);
create index outfits_user_created_idx on public.outfits(user_id, created_at desc);
create index outfit_items_user_outfit_idx on public.outfit_items(user_id, outfit_id);
create index planner_entries_user_date_idx on public.planner_entries(user_id, planned_for);
create index shopping_list_user_created_idx on public.shopping_list_items(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger closet_items_updated_at before update on public.closet_items
for each row execute function public.set_updated_at();
create trigger outfits_updated_at before update on public.outfits
for each row execute function public.set_updated_at();
create trigger planner_entries_updated_at before update on public.planner_entries
for each row execute function public.set_updated_at();
create trigger shopping_list_updated_at before update on public.shopping_list_items
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.closet_items enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.planner_entries enable row level security;
alter table public.shopping_list_items enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles
for delete to authenticated using ((select auth.uid()) = id);

create policy closet_items_select_own on public.closet_items
for select to authenticated using ((select auth.uid()) = user_id);
create policy closet_items_insert_own on public.closet_items
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy closet_items_update_own on public.closet_items
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy closet_items_delete_own on public.closet_items
for delete to authenticated using ((select auth.uid()) = user_id);

create policy outfits_select_own on public.outfits
for select to authenticated using ((select auth.uid()) = user_id);
create policy outfits_insert_own on public.outfits
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy outfits_update_own on public.outfits
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy outfits_delete_own on public.outfits
for delete to authenticated using ((select auth.uid()) = user_id);

create policy outfit_items_select_own on public.outfit_items
for select to authenticated using ((select auth.uid()) = user_id);
create policy outfit_items_insert_own on public.outfit_items
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy outfit_items_update_own on public.outfit_items
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy outfit_items_delete_own on public.outfit_items
for delete to authenticated using ((select auth.uid()) = user_id);

create policy planner_entries_select_own on public.planner_entries
for select to authenticated using ((select auth.uid()) = user_id);
create policy planner_entries_insert_own on public.planner_entries
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy planner_entries_update_own on public.planner_entries
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy planner_entries_delete_own on public.planner_entries
for delete to authenticated using ((select auth.uid()) = user_id);

create policy shopping_list_select_own on public.shopping_list_items
for select to authenticated using ((select auth.uid()) = user_id);
create policy shopping_list_insert_own on public.shopping_list_items
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy shopping_list_update_own on public.shopping_list_items
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy shopping_list_delete_own on public.shopping_list_items
for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clothing-photos',
  'clothing-photos',
  false,
  12582912,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy clothing_photos_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'clothing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy clothing_photos_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clothing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy clothing_photos_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'clothing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'clothing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy clothing_photos_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'clothing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter publication supabase_realtime add table
  public.closet_items,
  public.outfits,
  public.outfit_items,
  public.planner_entries,
  public.shopping_list_items;

commit;
