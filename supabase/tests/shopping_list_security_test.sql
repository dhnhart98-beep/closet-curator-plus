-- Self-contained shopping-list and product-image isolation test.
-- Run in the Supabase SQL Editor; every test record is rolled back.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
(
  '30000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'shopping-a@example.invalid', '',
  now(), now(), now()
),
(
  '40000000-0000-4000-8000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'shopping-b@example.invalid', '',
  now(), now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

insert into public.shopping_list_items (
  id, user_id, name, product_url, image_path, priority
) values (
  '31000000-0000-4000-8000-000000000013',
  '30000000-0000-4000-8000-000000000003',
  'Private handbag',
  'https://example.com/bag',
  '30000000-0000-4000-8000-000000000003/shopping-list/31000000-0000-4000-8000-000000000013/bag.jpg',
  'High'
);

insert into storage.objects (bucket_id, name, owner)
values (
  'clothing-photos',
  '30000000-0000-4000-8000-000000000003/shopping-list/31000000-0000-4000-8000-000000000013/bag.jpg',
  '30000000-0000-4000-8000-000000000003'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);

do $$
declare
  item_count integer;
  image_count integer;
begin
  select count(*) into item_count
  from public.shopping_list_items
  where id = '31000000-0000-4000-8000-000000000013';
  if item_count <> 0 then
    raise exception 'RLS FAILURE: user B can read user A shopping item';
  end if;

  select count(*) into image_count
  from storage.objects
  where bucket_id = 'clothing-photos'
    and name like '30000000-0000-4000-8000-000000000003/shopping-list/%';
  if image_count <> 0 then
    raise exception 'STORAGE FAILURE: user B can read user A product image';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.shopping_list_items (user_id, name)
    values ('30000000-0000-4000-8000-000000000003', 'Forbidden item');
    raise exception 'RLS FAILURE: user B inserted an item owned by user A';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'clothing-photos',
      '30000000-0000-4000-8000-000000000003/shopping-list/forbidden/image.jpg',
      '40000000-0000-4000-8000-000000000004'
    );
    raise exception 'STORAGE FAILURE: user B inserted into user A folder';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
end
$$;

rollback;
