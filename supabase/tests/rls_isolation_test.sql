-- Self-contained two-user isolation test for the Supabase SQL Editor.
-- It creates disposable auth users inside a transaction and rolls everything back.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
(
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'rls-test-a@example.invalid', '',
  now(), now(), now()
),
(
  '20000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'rls-test-b@example.invalid', '',
  now(), now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.closet_items (user_id, name, category)
values (
  '10000000-0000-4000-8000-000000000001',
  'RLS test item A',
  'Top'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.closet_items
  where name = 'RLS test item A';

  if visible_count <> 0 then
    raise exception 'RLS FAILURE: user B can read user A records';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.closet_items (user_id, name, category)
    values (
      '10000000-0000-4000-8000-000000000001',
      'Forbidden cross-user insert',
      'Top'
    );
    raise exception 'RLS FAILURE: user B inserted a row owned by user A';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
end
$$;

rollback;
