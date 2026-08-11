-- =====================================================================
-- Nós — date ideas, and three wishes each
--
-- Two additions that answer the same complaint from opposite directions:
-- "I don't know what to do" and "I don't know what to get you".
--
--   1. `date_ideas` — a shelf of things the two of you might do, each
--      carrying what it actually costs, when it is good, how it tends to
--      feel, what you need to bring, and whether it has to be booked.
--      A plan says *when*; an idea says *whether*, which is the question
--      you are actually stuck on at seven o'clock on a Friday.
--
--   2. `wishes` — three per person, no more, kept by their owner and read
--      by their partner. The cap is the feature: a list of forty things
--      is a shopping site, and a shopping site cannot be a gift.
--
-- The privacy shapes are deliberately different, and opposite to what you
-- might guess:
--
--   - A date idea is shared. Both of you write it, both of you read it.
--   - A wish is written by exactly one person and read by both. Your
--     partner may mark one granted — that is the whole point — but may
--     never edit the words, because a wish somebody else rewrote is not a
--     wish any more.
--   - `gift_ideas` stays author-private, untouched. A wish is what you
--     said out loud; a gift idea is what they noticed. Merging them would
--     spoil every surprise in the app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Date ideas
-- ---------------------------------------------------------------------

/*
 * 0004 creates `places`, which the `place_id` reference below needs, and
 * 0012 creates `refuse_when_ended()`, which the closing triggers at the
 * bottom call. Said here, once, rather than failing two hundred lines
 * down with an error that names neither file.
 */
do $$
begin
  if to_regclass('public.places') is null then
    raise exception
      '0013_ideas_and_wishes needs 0004_together: public.places is missing. Run 0004_together.sql first, then run this file again.';
  end if;
  if to_regproc('public.refuse_when_ended') is null then
    raise exception
      '0013_ideas_and_wishes needs 0012_closed_space: public.refuse_when_ended() is missing. Run 0012_closed_space.sql first, then run this file again.';
  end if;
end;
$$;

create table if not exists public.date_ideas (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  title      text not null check (btrim(title) <> ''),
  note       text,

  -- What it costs, as a band rather than a number.
  --
  -- A number would be a lie in four currencies at once, and would date
  -- badly besides. A band answers the question actually being asked —
  -- can we do this this week — and survives both inflation and a flight.
  cost       text not null default 'modest'
               check (cost in ('free', 'cheap', 'modest', 'splash')),
  -- Optional, for when somebody does know: minor units of the couple's
  -- currency at the time of writing. Never converted, never totalled.
  typical_cents integer check (typical_cents is null or typical_cents >= 0),

  -- When it is good. An array because plenty of things are good at more
  -- than one hour and bad at the rest, and a single "best time" would
  -- force a choice nobody means.
  times      text[] not null default '{}'::text[]
               check (times <@ array['morning','afternoon','evening','night','allday']::text[]),

  -- How it tends to feel. The column that makes the shelf usable: on a
  -- flat Tuesday you are not looking for "an activity", you are looking
  -- for something calm, and no other field can answer that.
  feeling    text not null default 'easy'
               check (feeling in ('calm', 'playful', 'romantic', 'adventurous', 'cultured', 'easy')),

  -- What you have to take. Free text, because the answer is "the good
  -- camera, and cash — they don't take cards".
  bring      text,

  -- Booking, and how far ahead. Null lead time means "book it, no idea
  -- how far ahead", which is a real and common state.
  booking    text not null default 'none'
               check (booking in ('none', 'advised', 'required')),
  book_days_ahead smallint check (book_days_ahead is null or book_days_ahead between 0 and 365),

  -- Weather-dependent things vanish from the suggestions on a wet day.
  outdoors   boolean not null default false,
  -- How long it takes, in minutes. Roughly.
  minutes    integer check (minutes is null or minutes between 5 and 2880),

  -- Where it came from and where it went.
  place_id   uuid references public.places (id) on delete set null,
  -- Set when the idea has actually been done, so the shelf can put the
  -- untried things first without ever deleting the good repeats.
  last_done_on date,
  done_count integer not null default 0 check (done_count >= 0),
  -- Neither partner's favourite: the couple's. One flag, not two, because
  -- two would make it a comparison.
  favourite  boolean not null default false,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists date_ideas_couple_idx
  on public.date_ideas (couple_id, favourite desc, created_at desc);

drop trigger if exists date_ideas_touch on public.date_ideas;
create trigger date_ideas_touch
  before update on public.date_ideas
  for each row execute function public.touch_updated_at();

-- A plan can say which idea it came from, which is what lets an idea know
-- it has been used without anybody having to tick it off by hand.
alter table public.plans
  add column if not exists idea_id uuid references public.date_ideas (id) on delete set null;

create index if not exists plans_idea_idx
  on public.plans (idea_id) where idea_id is not null;

-- ---------------------------------------------------------------------
-- 2. Wishes
--
-- Three each. The cap is enforced by a partial unique index on the slot
-- number rather than by counting rows in a trigger: an index cannot race,
-- and two devices saving a fourth wish at the same moment is exactly the
-- kind of thing a count-then-insert check gets wrong.
--
-- Granted wishes keep their slot free by leaving it. `slot` is null once
-- granted, which both releases the seat for a new wish and turns the row
-- into history in one step.
-- ---------------------------------------------------------------------

create table if not exists public.wishes (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,

  title      text not null check (btrim(title) <> ''),
  -- Deliberately short. A wish is "the green coat, the one with the
  -- wooden buttons" — the detail that makes it findable, not an essay.
  note       text check (note is null or length(note) <= 400),
  photo_path text,
  link       text,

  -- 1, 2 or 3 while it is a live wish; null once it has been granted.
  slot       smallint check (slot is null or slot between 1 and 3),

  granted_on   date,
  -- Who granted it. Nullable because "it just happened" is a real answer,
  -- and because a wish granted by the person who wished it is fine too.
  granted_by   uuid references public.profiles (id) on delete set null,
  -- What the giver wanted to say about it, kept with the wish so the
  -- history reads as a memory rather than a receipt.
  granted_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A granted wish holds no slot, and a live one holds exactly one.
  constraint wishes_slot_matches_granted
    check ((granted_on is null) = (slot is not null))
);

-- Three seats per person, and no way to sit in two at once.
create unique index if not exists wishes_one_per_slot
  on public.wishes (profile_id, slot) where slot is not null;

create index if not exists wishes_couple_idx
  on public.wishes (couple_id, profile_id, granted_on desc nulls first);

drop trigger if exists wishes_touch on public.wishes;
create trigger wishes_touch
  before update on public.wishes
  for each row execute function public.touch_updated_at();

/*
 * `couple_id` is filled in from the profile, never trusted from the client.
 *
 * Exactly the pattern already used for trip_items, memory_photos and
 * cycle_events. Without it a client could write a wish carrying somebody
 * else's couple_id and have the read policy hand it to the wrong pair.
 */
create or replace function public.set_wish_couple()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select couple_id into new.couple_id
    from public.profiles where id = new.profile_id;
  if new.couple_id is null then
    raise exception 'that profile is not in a couple' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists wishes_set_couple on public.wishes;
create trigger wishes_set_couple
  before insert or update of profile_id on public.wishes
  for each row execute function public.set_wish_couple();

/*
 * Only the wisher edits the wish. Only the partner grants it.
 *
 * RLS restricts rows, not columns — the same gap that let a partner
 * rewrite their own role in 0005 — so a policy alone cannot say "you may
 * change these three fields and no others". This trigger does.
 *
 * Granting is a real act by the other person and has to be theirs to
 * make: a wish you had to mark granted yourself is a chore, not a gift.
 */
create or replace function public.guard_wish_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_owner boolean := old.profile_id = auth.uid();
begin
  if v_is_owner then
    return new;
  end if;

  -- Everything a partner may not touch.
  if new.title is distinct from old.title
     or new.note is distinct from old.note
     or new.photo_path is distinct from old.photo_path
     or new.link is distinct from old.link
     or new.profile_id is distinct from old.profile_id then
    raise exception 'only the person who wished it can change the words'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists wishes_guard_update on public.wishes;
create trigger wishes_guard_update
  before update on public.wishes
  for each row execute function public.guard_wish_update();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.date_ideas enable row level security;
alter table public.wishes     enable row level security;

-- Date ideas: the ordinary shared shape, same predicate as everything else.
drop policy if exists date_ideas_all on public.date_ideas;
create policy date_ideas_all on public.date_ideas
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- Wishes: read by the couple, written only by the wisher, updated by
-- either (with the trigger above deciding which columns), and deleted
-- only by the wisher — taking back your own wish is yours to do, and
-- deleting your partner's is not.
drop policy if exists wishes_select on public.wishes;
create policy wishes_select on public.wishes
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists wishes_insert on public.wishes;
create policy wishes_insert on public.wishes
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists wishes_update on public.wishes;
create policy wishes_update on public.wishes
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists wishes_delete on public.wishes;
create policy wishes_delete on public.wishes
  for delete to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- A closed space closes these too
--
-- 0012 attaches this trigger from a fixed list, so a table added later
-- would otherwise be the one place still writable after a couple ends.
-- Attached here rather than by editing 0012, because a migration that has
-- already run on somebody's database cannot be relied on to run again.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['date_ideas', 'wishes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_refuse_when_ended', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.refuse_when_ended()',
      t || '_refuse_when_ended', t
    );
  end loop;
end;
$$;
