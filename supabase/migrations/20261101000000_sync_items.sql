-- Rafeeq Pro sync: one row per synced item, per user.
--
-- Table: a row is one item of one collection (a note, a bookmark, a streak
-- day, ...) keyed by (user_id, collection, item_key). `value` is the item's
-- JSON, `edited_at` the client's time of the last edit (a delete counts as an
-- edit: `deleted` true, `value` usually null), and `server_at` the time the
-- server last stored the row. Deleting the auth user removes every row
-- through the cascade (Delete account deletes the auth user last).
--
-- Pull cursor: clients pull `server_at > cursor order by server_at`, so the
-- trigger stamps `server_at` with clock_timestamp() on every write, whatever
-- the client sent. clock_timestamp() rather than now(): now() is fixed for
-- the whole transaction, so two writes in one transaction would tie. A row
-- can still commit after a later-stamped one, at most a statement's length
-- later; the client re-reads 10 s behind its cursor to catch it (merging is
-- idempotent). That overlap must stay at least the `authenticated` role's
-- statement_timeout (8 s by default).
--
-- Row-level security: each signed-in user reaches only rows whose user_id is
-- their own, for every command. `user_id` defaults to auth.uid(), and the
-- insert/update checks refuse any other value. Pro-only is enforced in the
-- app, not here: the database only enforces "own rows".
--
-- Size bounds: collection 1-64 characters, item_key 1-256, value at most
-- 256 KB (a recitation-history session can carry a whole-Quran queue, about
-- 125 KB), and at most 500 items per push. There is deliberately no per-user
-- row quota yet (Pro is enforced in the app, per the spec); the bounds cap
-- what any one account can store per row and per call.
--
-- sync_push: the last-write-wins push the app uses instead of writing rows
-- directly. It upserts each item, but replaces a stored row only when the
-- pushed edit is strictly newer, so an older edit never overwrites a newer
-- one and a tie keeps the stored row. It returns the stored rows for every
-- pushed key, including the ones whose push lost, so the client learns the
-- winner. It runs as the caller (security invoker), so RLS applies, and it
-- takes user_id from auth.uid(), never from the payload.

create table public.sync_items (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  collection text not null,
  item_key text not null,
  value jsonb,
  edited_at timestamptz not null,
  deleted boolean not null default false,
  server_at timestamptz not null default now(),
  primary key (user_id, collection, item_key),
  constraint sync_items_collection_length
    check (char_length(collection) between 1 and 64),
  constraint sync_items_item_key_length
    check (char_length(item_key) between 1 and 256),
  constraint sync_items_value_size
    check (pg_column_size(value) <= 262144)
);

-- The pull: one user's rows after the cursor, in server_at order. (The
-- primary key already leads with user_id, which serves the cascade.)
create index sync_items_user_id_server_at_idx
  on public.sync_items (user_id, server_at);

create function public.sync_items_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_at := clock_timestamp();
  return new;
end;
$$;

-- Only ever runs as the trigger; nobody calls it directly.
revoke execute on function public.sync_items_stamp() from public, anon, authenticated;

create trigger sync_items_stamp
  before insert or update on public.sync_items
  for each row execute function public.sync_items_stamp();

alter table public.sync_items enable row level security;

create policy "sync_items: read own rows" on public.sync_items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sync_items: insert own rows" on public.sync_items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "sync_items: update own rows" on public.sync_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "sync_items: delete own rows" on public.sync_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.sync_items from anon, authenticated;
grant select, insert, update, delete on table public.sync_items to authenticated;

-- items: a JSON array of {collection, item_key, value, edited_at, deleted}.
-- Any other field (user_id, server_at, ...) is ignored. A missing `deleted`
-- means false; a missing collection, item_key or edited_at fails the
-- not-null constraints, and an item over the size bounds fails the checks
-- (23514); either way the whole push is rolled back. More than 500 items is
-- refused (the client pushes in chunks of 200).
create function public.sync_push(items jsonb)
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
    edited_at timestamptz, deleted boolean
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
SELF-CHECK. Run it in the Supabase SQL editor after applying this migration,
in each project (dev, then prod): copy everything from `do $$` to the final
`$$;` below. It creates two throwaway auth users, A and B, checks the rules as
each of them, then deletes them. A run that finishes with no error means it
passed (the "sync_items self-check: PASS" notice shows if your client
displays notices). Any failure stops at an error "FAIL n: ..." and rolls
everything back, the throwaway users included. (If the editor refuses the
insert into auth.users, create two users under Authentication -> Users, put
their ids in place of gen_random_uuid() below, and drop that insert. If
the delete in step 11 is refused too, drop it and its check, then delete
both users in the dashboard and confirm
`select count(*) from public.sync_items where collection = 'selfcheck'`
is 0.)

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  r public.sync_items;
  n int;
  rows_before int;
  first_server_at timestamptz;
begin
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'sync-check-' || a || '@example.invalid'),
    (b, 'authenticated', 'authenticated', 'sync-check-' || b || '@example.invalid');

  -- Act as user A, signed in, through the API role.
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A new item is stored under A, whatever user_id or server_at the
  --    payload claims.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'k1', 'value', '{"v": 2}'::jsonb,
    'edited_at', '2026-01-02T00:00:00Z', 'deleted', false,
    'user_id', b, 'server_at', '2000-01-01T00:00:00Z')));
  if r.user_id is distinct from a
     or r.value is distinct from '{"v": 2}'::jsonb
     or r.server_at < '2001-01-01'::timestamptz then
    raise exception 'FAIL 1: new item not stored under A as pushed (%)', row_to_json(r);
  end if;
  first_server_at := r.server_at;

  -- 2. An older edit loses: the row is unchanged, and the push returns the
  --    stored (newer) row.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'k1', 'value', '{"v": 1}'::jsonb,
    'edited_at', '2026-01-01T00:00:00Z')));
  if r.value is distinct from '{"v": 2}'::jsonb
     or r.edited_at <> '2026-01-02T00:00:00Z'::timestamptz then
    raise exception 'FAIL 2: older edit was not refused (%)', row_to_json(r);
  end if;
  select * into r from public.sync_items
    where collection = 'selfcheck' and item_key = 'k1';
  if r.value is distinct from '{"v": 2}'::jsonb or r.server_at <> first_server_at then
    raise exception 'FAIL 2: older edit changed the stored row (%)', row_to_json(r);
  end if;

  -- 3. A tie (same edited_at) keeps the stored row.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'k1', 'value', '{"v": 99}'::jsonb,
    'edited_at', '2026-01-02T00:00:00Z')));
  if r.value is distinct from '{"v": 2}'::jsonb or r.server_at <> first_server_at then
    raise exception 'FAIL 3: a tie overwrote the stored row (%)', row_to_json(r);
  end if;

  -- 4. A newer edit (here a delete) wins and moves server_at forward.
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'k1', 'value', null,
    'edited_at', '2026-01-03T00:00:00Z', 'deleted', true)));
  if r.deleted is not true or r.value is not null
     or r.edited_at <> '2026-01-03T00:00:00Z'::timestamptz
     or r.server_at <= first_server_at then
    raise exception 'FAIL 4: newer edit did not win (%)', row_to_json(r);
  end if;

  -- 5. The same key twice in one push: no error, the newest copy is stored.
  select count(*) into n from public.sync_push(jsonb_build_array(
    jsonb_build_object('collection', 'selfcheck', 'item_key', 'k2',
      'value', '{"v": 5}'::jsonb, 'edited_at', '2026-01-05T00:00:00Z'),
    jsonb_build_object('collection', 'selfcheck', 'item_key', 'k2',
      'value', '{"v": 4}'::jsonb, 'edited_at', '2026-01-04T00:00:00Z')));
  select * into r from public.sync_items
    where collection = 'selfcheck' and item_key = 'k2';
  if n <> 1 or r.value is distinct from '{"v": 5}'::jsonb then
    raise exception 'FAIL 5: duplicate key in one push (% rows, %)', n, row_to_json(r);
  end if;

  -- 6. An empty array does nothing.
  select count(*) into n from public.sync_push('[]'::jsonb);
  if n <> 0 then
    raise exception 'FAIL 6: empty push returned % rows', n;
  end if;

  -- 7. Anything but an array is refused.
  begin
    perform * from public.sync_push('{"collection": "selfcheck"}'::jsonb);
    raise exception 'FAIL 7: a non-array push was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- 7b. An item_key over 256 characters is refused (23514) and nothing is
  --     stored.
  select count(*) into rows_before from public.sync_items;
  begin
    perform * from public.sync_push(jsonb_build_array(jsonb_build_object(
      'collection', 'selfcheck', 'item_key', repeat('k', 257),
      'edited_at', '2026-01-01T00:00:00Z')));
    raise exception 'FAIL 7b: a 257-character item_key was accepted';
  exception when check_violation then null;
  end;
  select count(*) into n from public.sync_items;
  if n <> rows_before then
    raise exception 'FAIL 7b: row count changed from % to %', rows_before, n;
  end if;

  -- 7c. A push of more than 500 items is refused (22023) and nothing is
  --     stored.
  begin
    perform * from public.sync_push((
      select jsonb_agg(jsonb_build_object(
        'collection', 'selfcheck', 'item_key', 'bulk-' || g,
        'edited_at', '2026-01-01T00:00:00Z'))
      from generate_series(1, 501) as g));
    raise exception 'FAIL 7c: a 501-item push was accepted';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into n from public.sync_items;
  if n <> rows_before then
    raise exception 'FAIL 7c: row count changed from % to %', rows_before, n;
  end if;

  -- 8. A cannot insert a row for B directly (RLS).
  begin
    insert into public.sync_items (user_id, collection, item_key, edited_at)
      values (b, 'selfcheck', 'k1', now());
    raise exception 'FAIL 8: A inserted a row for B';
  exception when insufficient_privilege then null;
  end;

  -- 9. As B: none of A's rows are visible or changeable, and pushing A's key
  --    creates B's own row.
  perform set_config('request.jwt.claims',
    json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.sync_items;
  if n <> 0 then
    raise exception 'FAIL 9: B sees % rows', n;
  end if;
  update public.sync_items set value = '"hacked"'::jsonb where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL 9: B updated % of A''s rows', n;
  end if;
  delete from public.sync_items where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL 9: B deleted % of A''s rows', n;
  end if;
  select * into r from public.sync_push(jsonb_build_array(jsonb_build_object(
    'collection', 'selfcheck', 'item_key', 'k1', 'value', '"B"'::jsonb,
    'edited_at', '2030-01-01T00:00:00Z')));
  if r.user_id is distinct from b then
    raise exception 'FAIL 9: B''s push did not land under B (%)', row_to_json(r);
  end if;

  -- 10. Signed out (anon): no push, no reads.
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
  begin
    perform * from public.sync_push('[]'::jsonb);
    raise exception 'FAIL 10: anon called sync_push';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.sync_items;
    raise exception 'FAIL 10: anon read sync_items';
  exception when insufficient_privilege then null;
  end;

  -- 11. As the owner again: B's push left A's row alone, and deleting the
  --     auth users removes their rows (cascade).
  reset role;
  select * into r from public.sync_items
    where user_id = a and collection = 'selfcheck' and item_key = 'k1';
  if r.deleted is not true then
    raise exception 'FAIL 11: A''s row changed after B''s push (%)', row_to_json(r);
  end if;
  delete from auth.users where id in (a, b);
  select count(*) into n from public.sync_items where user_id in (a, b);
  if n <> 0 then
    raise exception 'FAIL 11: % rows survived deleting the auth users', n;
  end if;

  raise notice 'sync_items self-check: PASS';
end
$$;
*/
