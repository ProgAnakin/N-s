-- =====================================================================
-- Nós — enough of Supabase to run the migrations against plain Postgres
--
-- Not part of the schema. This exists so `npm run db:check` can apply all
-- twelve migrations to a throwaway database and see whether they actually
-- work, rather than finding out in the SQL Editor against the real one.
--
-- Today's lesson made the case: two migrations failed on a dependency
-- that a thirty-second local run would have caught, and a third reported
-- success while doing two thirds of its job. None of that needed a
-- Supabase project to discover — it only needed someone to run the files
-- in order once.
--
-- Everything here is the shape the migrations depend on and nothing more:
-- the two schemas, the users table a profile hangs off, the three
-- `auth.*` functions the policies call, and the storage tables. It is not
-- a reimplementation of Supabase and must not grow into one.
-- =====================================================================

create schema if not exists auth;
create schema if not exists storage;

-- The row `handle_new_user` fires from, and the target of every
-- `references auth.users` in 0001.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- Who is asking
--
-- In Supabase these read the request's JWT. Here they read a session
-- setting, so a test can say "now I am her" between statements:
--
--   select set_config('nos.test.uid', '<uuid>', false);
-- ---------------------------------------------------------------------

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('nos.test.uid', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('nos.test.role', true), ''), 'authenticated');
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select '{}'::jsonb;
$$;

-- ---------------------------------------------------------------------
-- Storage, to the depth 0003 touches it
-- ---------------------------------------------------------------------

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;

-- `storage.foldername(name)` splits a path into its directories, which is
-- how 0003 scopes a file to a couple: the first folder is the couple id.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
$$;

-- The roles the policies are granted to.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public, auth, storage to authenticated, anon;
