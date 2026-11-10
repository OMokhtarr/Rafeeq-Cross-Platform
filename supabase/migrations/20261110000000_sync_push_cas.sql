-- sync_push: keep rows stored after the copy a push was based on.
--
-- Last-write-wins alone lets a push overwrite a row it never saw. A device
-- pulls, reconciles, then pushes; another device's row stored in between
-- (an edit, while this device pushes a delete) is replaced if the pushed
-- edited_at is newer, and that edit is lost.
--
-- Each pushed item may now carry `base_server_at`: the server_at of the
-- stored copy the client reconciled against, or, for a key it pulled no row
-- for, the cursor of its last pull (every older row reached it then). The
-- push replaces or inserts a row only if no stored row for that key has a
-- server_at after that base; otherwise the stored row stays and comes back
-- in the result like any other lost push, and the client reconciles against
-- it. The edited_at rule is unchanged on top of this.
--
-- Items without `base_server_at` (installs from before this change) keep
-- plain last-write-wins, so this deploys in any order with the app.
--
-- The pushed keys' existing rows are locked first, so a push from another
-- device can't change one between the check and the upsert. A key with no
-- row yet can't be locked: a row another device inserts for it in that
-- window is only held to the edited_at rule.

create or replace function public.sync_push(items jsonb)
returns setof public.sync_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sync_push needs a signed-in user' using errcode = '42501';
  end if;
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'sync_push expects a JSON array of items'
      using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 500 then
    raise exception 'sync_push takes at most 500 items per call (got %)',
      jsonb_array_length(items)
      using errcode = '22023';
  end if;

  -- Lock the stored rows for the pushed keys until this call's transaction ends.
  perform 1
  from public.sync_items as s
  where s.user_id = uid
    and (s.collection, s.item_key) in (
      select i.collection, i.item_key
      from jsonb_to_recordset(items) as i(collection text, item_key text)
    )
  for update;

  -- distinct on: a key pushed twice in one call keeps its newest copy (an
  -- upsert may not touch the same row twice in one statement); the value
  -- breaks a tie so the pick doesn't depend on the payload's order.
  insert into public.sync_items as s
    (user_id, collection, item_key, value, edited_at, deleted)
  select distinct on (i.collection, i.item_key)
    uid, i.collection, i.item_key, i.value, i.edited_at,
    coalesce(i.deleted, false)
  from jsonb_to_recordset(items) as i(
    collection text, item_key text, value jsonb,
    edited_at timestamptz, deleted boolean, base_server_at timestamptz
  )
  where i.base_server_at is null
     or not exists (
       select 1
       from public.sync_items as cur
       where cur.user_id = uid
         and cur.collection = i.collection
         and cur.item_key = i.item_key
         and cur.server_at > i.base_server_at
     )
  order by i.collection, i.item_key, i.edited_at desc, i.value::text desc
  on conflict (user_id, collection, item_key) do update
    set value = excluded.value,
        edited_at = excluded.edited_at,
        deleted = excluded.deleted
    where excluded.edited_at > s.edited_at;

  -- A separate statement, so it sees the rows as stored now: the ones this
  -- push wrote, and the newer ones it lost to.
  return query
    select s.*
    from public.sync_items as s
    where s.user_id = uid
      and (s.collection, s.item_key) in (
        select i.collection, i.item_key
        from jsonb_to_recordset(items) as i(collection text, item_key text)
      );
end;
$$;

revoke execute on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

/*
SELF-CHECK. Run it in the Supabase SQL editor after applying this migration:
copy everything from `do $$` to the final `$$;` below. It creates one
throwaway auth user, checks the base_server_at rules as that user, then
deletes it. A run that finishes with no error means it passed (the
"sync_push CAS self-check: PASS" notice shows if your client displays
notices). Any failure stops at an error "FAIL n: ..." and rolls everything
back, the throwaway user included. Run the self-check in
20261101000000_sync_items.sql too: the rest of sync_push is unchanged and
must still pass it.

do $$
declare
  a uuid := gen_random_uuid();
  r public.sync_items;
  t1 timestamptz;
  t2 timestamptz;
begin
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'sync-cas-check-' || a || '@example.invalid');
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A new key with a base before every row is stored.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'c1', 'value', '{"v": 1}'::jsonb,
    'edited_at', '2026-01-01T00:00:00Z',
    'base_server_at', '1970-01-01T00:00:00Z')));
  if r.value is distinct from '{"v": 1}'::jsonb then
    raise exception 'FAIL 1: new key not stored (%)', row_to_json(r);
  end if;
  t1 := r.server_at;

  -- 2. A newer edit based on the stored copy wins.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'c1', 'value', '{"v": 2}'::jsonb,
    'edited_at', '2026-01-02T00:00:00Z', 'base_server_at', t1)));
  if r.value is distinct from '{"v": 2}'::jsonb or r.server_at <= t1 then
    raise exception 'FAIL 2: edit based on the stored copy did not win (%)', row_to_json(r);
  end if;
  t2 := r.server_at;

  -- 3. A newer edit based on an older copy loses: the stored row stays and
  --    comes back.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'c1', 'value', '{"v": 3}'::jsonb,
    'edited_at', '2026-01-03T00:00:00Z', 'base_server_at', t1)));
  if r.value is distinct from '{"v": 2}'::jsonb or r.server_at <> t2 then
    raise exception 'FAIL 3: a push based on an older copy replaced the row (%)', row_to_json(r);
  end if;

  -- 4. The same for a key whose only base is an old pull cursor.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'c1', 'value', null, 'deleted', true,
    'edited_at', '2026-01-04T00:00:00Z',
    'base_server_at', '1970-01-01T00:00:00Z')));
  if r.deleted or r.server_at <> t2 then
    raise exception 'FAIL 4: a delete based on an old cursor replaced the row (%)', row_to_json(r);
  end if;

  -- 5. Without base_server_at (older installs), last-write-wins as before.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'c1', 'value', '{"v": 5}'::jsonb,
    'edited_at', '2026-01-05T00:00:00Z')));
  if r.value is distinct from '{"v": 5}'::jsonb or r.server_at <= t2 then
    raise exception 'FAIL 5: a push without a base did not win as before (%)', row_to_json(r);
  end if;

  -- 6. A base in the future of the stored row still obeys edited_at: older loses.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'c1', 'value', '{"v": 0}'::jsonb,
    'edited_at', '2025-01-01T00:00:00Z',
    'base_server_at', '2999-01-01T00:00:00Z')));
  if r.value is distinct from '{"v": 5}'::jsonb then
    raise exception 'FAIL 6: an older edit won (%)', row_to_json(r);
  end if;

  reset role;
  delete from auth.users where id = a;
  raise notice 'sync_push CAS self-check: PASS';
end
$$;
*/
