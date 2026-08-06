-- =====================================================================
-- Nós — hardening
--
-- Row Level Security decides *which rows* you may write. It cannot decide
-- *which columns*, and that gap turned out to matter here: the policy on
-- `profiles` correctly restricted you to your own row, and then let you
-- rewrite every field in it — including the two that decide which couple
-- you belong to.
--
-- Reachable consequence: either partner could flip their own `role` from
-- partner_b to partner_a, which silently reassigns the ownership of every
-- expense ever logged. Theoretical consequence: setting `couple_id` to
-- another couple's id would make you a member of it. That needs a guessed
-- UUIDv4 and is not practically reachable, but "hard to guess" is
-- obscurity, not a control.
--
-- Membership now changes only through the pairing functions, which opt in
-- explicitly with a transaction-local flag.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Membership is not self-service
-- ---------------------------------------------------------------------

create or replace function public.freeze_membership()
returns trigger
language plpgsql
as $$
begin
  -- Set only inside create_couple / join_couple, and only for the duration
  -- of that transaction.
  if coalesce(current_setting('nos.membership_change', true), '') = 'on' then
    return new;
  end if;

  if new.couple_id is distinct from old.couple_id then
    raise exception 'couple_id is set by pairing, not by update'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    raise exception 'role is set by pairing, not by update'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_freeze_membership on public.profiles;
create trigger profiles_freeze_membership
  before update on public.profiles
  for each row execute function public.freeze_membership();

-- A profile in a couple always has a role. Without this, `role` could be
-- left null — and because Postgres treats nulls as distinct in a unique
-- index, the (couple_id, role) index would happily admit a third member.
alter table public.profiles
  drop constraint if exists profiles_role_with_couple;
alter table public.profiles
  add constraint profiles_role_with_couple
  check ((couple_id is null) = (role is null));

-- ---------------------------------------------------------------------
-- The invite code is rotated, not edited
--
-- Without this either partner could set the code to a value of their
-- choosing, which defeats the point of rotating it to lock someone out.
-- ---------------------------------------------------------------------

create or replace function public.freeze_invite_code()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('nos.invite_rotation', true), '') = 'on' then
    return new;
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception 'invite_code is rotated through rotate_invite_code()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists couples_freeze_invite_code on public.couples;
create trigger couples_freeze_invite_code
  before update on public.couples
  for each row execute function public.freeze_invite_code();

-- ---------------------------------------------------------------------
-- A flower has to be for the person you are actually with
-- ---------------------------------------------------------------------

alter table public.flowers
  drop constraint if exists flowers_recipient_in_couple;

create or replace function public.check_flower_recipient()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.to_profile and p.couple_id = new.couple_id
  ) then
    raise exception 'recipient is not in this couple' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists flowers_check_recipient on public.flowers;
create trigger flowers_check_recipient
  before insert on public.flowers
  for each row execute function public.check_flower_recipient();

-- ---------------------------------------------------------------------
-- Pairing functions opt in to the membership change
-- ---------------------------------------------------------------------

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

  perform set_config('nos.membership_change', 'on', true);

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

  perform set_config('nos.membership_change', 'on', true);

  update public.profiles
     set couple_id = v_couple.id,
         role      = case when v_taken_role = 'partner_a' then 'partner_b' else 'partner_a' end
   where id = v_user_id;

  return v_couple;
end;
$$;

revoke all on function public.join_couple(text) from public;
grant execute on function public.join_couple(text) to authenticated;

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
  perform set_config('nos.invite_rotation', 'on', true);
  update public.couples set invite_code = v_code where id = v_couple_id;
  return v_code;
end;
$$;

revoke all on function public.rotate_invite_code() from public;
grant execute on function public.rotate_invite_code() to authenticated;

-- ---------------------------------------------------------------------
-- Leaving a couple, deliberately
--
-- Previously there was no way out at all, which meant a wrong pairing was
-- permanent. It has to be a function rather than an update, because the
-- trigger above now refuses the direct route.
-- ---------------------------------------------------------------------

create or replace function public.leave_couple()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform set_config('nos.membership_change', 'on', true);
  update public.profiles set couple_id = null, role = null where id = v_user_id;
end;
$$;

revoke all on function public.leave_couple() from public;
grant execute on function public.leave_couple() to authenticated;
