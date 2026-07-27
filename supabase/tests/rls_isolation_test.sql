-- Run in Supabase SQL Editor only after creating two disposable test users.
-- Replace the UUIDs below with their auth.users IDs. This transaction rolls back.
begin;

create temporary table test_ids (
  user_a uuid not null,
  user_b uuid not null
);

insert into test_ids values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

do $$
begin
  if exists (select 1 from test_ids where user_a::text like '%000000000001') then
    raise exception 'Replace the placeholder UUIDs before running this test';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select user_a::text from test_ids), true);

insert into public.closet_items (user_id, name, category)
select user_a, 'RLS test item A', 'Top' from test_ids;

select set_config('request.jwt.claim.sub', (select user_b::text from test_ids), true);

do $$
declare visible_count integer;
begin
  select count(*) into visible_count
  from public.closet_items
  where name = 'RLS test item A';
  if visible_count <> 0 then
    raise exception 'RLS FAILURE: user B can read user A records';
  end if;
end $$;

do $$
begin
  begin
    insert into public.closet_items (user_id, name, category)
    select user_a, 'Forbidden cross-user insert', 'Top' from test_ids;
    raise exception 'RLS FAILURE: user B inserted a row owned by user A';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
end $$;

rollback;
