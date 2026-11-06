-- The edge functions reach apple_tokens as service_role. Newer Supabase
-- projects no longer grant table privileges to the API roles by default, so
-- grant exactly what delete-account (select) and apple-token (upsert) need.
-- The client roles still hold nothing: see 20261029000000_apple_tokens.sql.

grant select, insert, update, delete on table public.apple_tokens to service_role;
