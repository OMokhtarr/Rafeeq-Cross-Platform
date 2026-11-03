-- Sign in with Apple refresh tokens, kept so account deletion can revoke the
-- app's Apple grant (App Store Review Guideline 5.1.1(v)).
--
-- Server-only: RLS is on with no policies and the client roles hold no
-- privileges, so only the service role (the edge functions) reaches it.
-- Deleting the auth user removes the row through the cascade.

create table public.apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  -- The client id the token was issued to (the bundle id for the native iOS
  -- sign-in). Apple only accepts a revoke from that same client id.
  client_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;

revoke all on table public.apple_tokens from anon, authenticated;
