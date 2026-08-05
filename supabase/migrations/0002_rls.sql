-- =====================================================================
-- Nós — Row Level Security
--
-- The privacy model, enforced by the database rather than by the UI.
--
--   1. A couple's data is readable and writable by exactly the two people
--      in that couple. Nobody else, ever.
--   2. A `private` remember_fact is visible only to the person who wrote it,
--      including to their partner.
--   3. A gift_idea is visible only to its author. The partner cannot read
--      one, count them, or know that any exist.
--
-- Every policy reduces to `couple_id = public.current_couple_id()` plus, for
-- the private tables, an author check. Keeping the predicate that boring is
-- the point: a policy you cannot read at a glance is a policy you cannot
-- trust.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Who am I, and who am I with?
--
-- SECURITY DEFINER so it bypasses RLS on `profiles`. That is what stops the
-- profiles policy from recursing into itself when it calls this.
-- ---------------------------------------------------------------------

create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_couple_id() from public;
grant execute on function public.current_couple_id() to authenticated;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere. No table in this schema is ever left open.
-- ---------------------------------------------------------------------

alter table public.couples             enable row level security;
alter table public.profiles            enable row level security;
alter table public.memories            enable row level security;
alter table public.important_dates     enable row level security;
alter table public.remember_facts      enable row level security;
alter table public.dismissed_questions enable row level security;
alter table public.family_members      enable row level security;
alter table public.phrases             enable row level security;
alter table public.culture_notes       enable row level security;
alter table public.trips               enable row level security;
alter table public.trip_items          enable row level security;
alter table public.expenses            enable row level security;
alter table public.gift_ideas          enable row level security;

-- ---------------------------------------------------------------------
-- couples
-- ---------------------------------------------------------------------

drop policy if exists couples_select on public.couples;
create policy couples_select on public.couples
  for select to authenticated
  using (id = public.current_couple_id());

-- Creating a couple goes through public.create_couple(); this policy exists
-- so the RPC's insert is attributable, not as a general-purpose door.
drop policy if exists couples_insert on public.couples;
create policy couples_insert on public.couples
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists couples_update on public.couples;
create policy couples_update on public.couples
  for update to authenticated
  using (id = public.current_couple_id())
  with check (id = public.current_couple_id());

-- ---------------------------------------------------------------------
-- profiles
--
-- You can always see yourself, and you can see your partner. You can only
-- ever edit yourself: nobody renames their partner.
-- ---------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (couple_id is not null and couple_id = public.current_couple_id())
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- The shared tables
--
-- Same shape for all of them: both partners, full access, nobody else.
-- ---------------------------------------------------------------------

do $$
declare
  shared_table text;
begin
  foreach shared_table in array array[
    'memories', 'important_dates', 'family_members',
    'phrases', 'culture_notes', 'trips', 'trip_items', 'expenses'
  ]
  loop
    execute format('drop policy if exists %I_all on public.%I', shared_table, shared_table);
    execute format($f$
      create policy %I_all on public.%I
        for all to authenticated
        using (couple_id = public.current_couple_id())
        with check (couple_id = public.current_couple_id())
    $f$, shared_table, shared_table);
  end loop;
end;
$$;

-- trip_items is in the loop above: its couple_id is set from the parent trip
-- by a trigger, so the same one-line predicate covers it safely.

-- ---------------------------------------------------------------------
-- remember_facts — the shared/private split
--
-- Read: shared notes, plus your own private ones.
-- Write: you always control your own; a shared note is co-owned and either
-- partner may edit it — but the WITH CHECK stops one partner turning the
-- other's note private, and the freeze_author trigger in 0001 stops anyone
-- claiming authorship of words they did not write.
-- ---------------------------------------------------------------------

drop policy if exists remember_facts_select on public.remember_facts;
create policy remember_facts_select on public.remember_facts
  for select to authenticated
  using (
    couple_id = public.current_couple_id()
    and (visibility = 'shared' or author_id = auth.uid())
  );

drop policy if exists remember_facts_insert on public.remember_facts;
create policy remember_facts_insert on public.remember_facts
  for insert to authenticated
  with check (
    couple_id = public.current_couple_id()
    and author_id = auth.uid()
  );

drop policy if exists remember_facts_update on public.remember_facts;
create policy remember_facts_update on public.remember_facts
  for update to authenticated
  using (
    couple_id = public.current_couple_id()
    and (visibility = 'shared' or author_id = auth.uid())
  )
  with check (
    couple_id = public.current_couple_id()
    and (visibility = 'shared' or author_id = auth.uid())
  );

drop policy if exists remember_facts_delete on public.remember_facts;
create policy remember_facts_delete on public.remember_facts
  for delete to authenticated
  using (
    couple_id = public.current_couple_id()
    and (visibility = 'shared' or author_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- dismissed_questions — your own prompt preferences, nobody else's business
-- ---------------------------------------------------------------------

drop policy if exists dismissed_questions_all on public.dismissed_questions;
create policy dismissed_questions_all on public.dismissed_questions
  for all to authenticated
  using (author_id = auth.uid() and couple_id = public.current_couple_id())
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------
-- gift_ideas — author only, in every direction
--
-- Note this is stricter than remember_facts: there is no shared variant and
-- no partner read. A surprise that your partner can audit is not a surprise.
-- ---------------------------------------------------------------------

drop policy if exists gift_ideas_all on public.gift_ideas;
create policy gift_ideas_all on public.gift_ideas
  for all to authenticated
  using (author_id = auth.uid() and couple_id = public.current_couple_id())
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

-- =====================================================================
-- Pairing
--
-- Both of these are SECURITY DEFINER because they must touch rows the caller
-- cannot yet see: you cannot select a couple by invite code when the select
-- policy already requires you to be in it. Each one re-checks the caller's
-- authorisation itself rather than trusting the client.
-- =====================================================================

create or replace function public.create_couple(
  p_couple_name      text default null,
  p_anniversary_date date default null,
  p_currency         text default 'EUR'
)
returns public.couples
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_couple public.couples;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select couple_id into v_existing from public.profiles where id = v_user_id;
  if v_existing is not null then
    raise exception 'You are already part of a couple.' using errcode = 'P0001';
  end if;

  if p_currency is null or p_currency not in ('EUR', 'BRL', 'CNY', 'USD') then
    raise exception 'Unsupported currency.' using errcode = '22023';
  end if;

  insert into public.couples (couple_name, anniversary_date, currency, invite_code, created_by)
  values (
    nullif(btrim(coalesce(p_couple_name, '')), ''),
    p_anniversary_date,
    p_currency,
    public.generate_invite_code(),
    v_user_id
  )
  returning * into v_couple;

  -- Whoever creates the space is partner A. It is a label for splitting
  -- costs and nothing more; the UI never ranks them.
  update public.profiles
     set couple_id = v_couple.id,
         role      = 'partner_a'
   where id = v_user_id;

  return v_couple;
end;
$$;

revoke all on function public.create_couple(text, date, text) from public;
grant execute on function public.create_couple(text, date, text) to authenticated;

create or replace function public.join_couple(p_invite_code text)
returns public.couples
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_couple public.couples;
  v_members int;
  v_taken_role text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select couple_id into v_existing from public.profiles where id = v_user_id;
  if v_existing is not null then
    raise exception 'You are already part of a couple.' using errcode = 'P0001';
  end if;

  select * into v_couple
    from public.couples
   where invite_code = upper(btrim(coalesce(p_invite_code, '')));

  if v_couple.id is null then
    raise exception 'That invite code does not match anything.' using errcode = 'P0002';
  end if;

  -- Locked so two people cannot claim the second seat at the same moment.
  perform 1 from public.couples where id = v_couple.id for update;

  select count(*), max(role) into v_members, v_taken_role
    from public.profiles where couple_id = v_couple.id;

  if v_members >= 2 then
    raise exception 'This space already has two people in it.' using errcode = 'P0003';
  end if;

  update public.profiles
     set couple_id = v_couple.id,
         role      = case when v_taken_role = 'partner_a' then 'partner_b' else 'partner_a' end
   where id = v_user_id;

  return v_couple;
end;
$$;

revoke all on function public.join_couple(text) from public;
grant execute on function public.join_couple(text) to authenticated;

-- Rotating the code is the only way to un-invite someone who saw it.
create or replace function public.rotate_invite_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_code text;
begin
  if v_couple_id is null then
    raise exception 'You are not part of a couple.' using errcode = 'P0001';
  end if;

  v_code := public.generate_invite_code();
  update public.couples set invite_code = v_code where id = v_couple_id;
  return v_code;
end;
$$;

revoke all on function public.rotate_invite_code() from public;
grant execute on function public.rotate_invite_code() to authenticated;
